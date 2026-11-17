import { NodeLevel } from '../../config';
import { one, Tx } from '../../common/db/db.service';

export interface SyncEvent {
  event_id: string;
  source_node_id: string;
  resource_type: string;
  resource_id: string;
  operation: 'insert' | 'update' | 'delete';
  base_version: number | null;
  new_version: number;
  payload: Record<string, unknown>;
  admin_unit_path: string | null;
}

export type Outcome = 'applied' | 'conflict' | 'rejected' | 'skipped';

const LEVEL_RANK: Record<NodeLevel, number> = { district: 1, region: 2, central: 3 };

interface ResourceSpec {
  table: string;
  columns: string[];
  versioned: boolean;
  /** Tabiiy kalit bo'yicha upsert (versiyasiz resurslar uchun). */
  naturalKey?: string[];
  userRefs?: string[];
  nullableRefs?: { column: string; table: string }[];
}

/** Faqat shu resurslar va ustunlar qabul qilinadi — qolgani e'tiborsiz qoldiriladi. */
export const RESOURCES: Record<string, ResourceSpec> = {
  'organization.administrative_units': {
    table: 'organization.administrative_units',
    columns: ['id', 'parent_id', 'level', 'name', 'code', 'path', 'version'],
    versioned: true,
  },
  'organization.organizations': {
    table: 'organization.organizations',
    columns: ['id', 'parent_id', 'administrative_unit_id', 'name', 'code', 'organization_type', 'status', 'owner_node_id', 'version'],
    versioned: true,
  },
  'core.tasks': {
    table: 'core.tasks',
    columns: [
      'id', 'organization_id', 'department_id', 'title', 'description', 'priority', 'status', 'classification',
      'deadline', 'completed_at', 'created_by', 'created_at', 'version',
    ],
    versioned: true,
    userRefs: ['created_by'],
    nullableRefs: [{ column: 'department_id', table: 'organization.departments' }],
  },
  'analytics.kpi_definitions': {
    table: 'analytics.kpi_definitions',
    columns: ['id', 'organization_id', 'code', 'name', 'unit', 'direction', 'period', 'created_at'],
    versioned: false,
  },
  'analytics.kpi_measurements': {
    table: 'analytics.kpi_measurements',
    columns: [
      'id', 'kpi_definition_id', 'organization_id', 'period_start', 'planned_value', 'actual_value', 'source', 'recorded_by', 'recorded_at',
    ],
    versioned: false,
    naturalKey: ['kpi_definition_id', 'period_start'],
    userRefs: ['recorded_by'],
  },
  'core.reports': {
    table: 'core.reports',
    columns: [
      'id', 'organization_id', 'report_type', 'period_start', 'period_end', 'status', 'content', 'classification',
      'created_by', 'approved_by', 'created_at', 'version',
    ],
    versioned: true,
    userRefs: ['created_by', 'approved_by'],
  },
};

/**
 * Kelgan hodisaga ishonish mumkinmi: manba darajasi yuboruvchidan yuqori bo'lmasligi, hodisa hududi
 * yuboruvchi doirasida bo'lishi va resursning asosiy yozuvchisi aynan manba darajasi bo'lishi kerak.
 */
export async function authorize(
  tx: Tx,
  e: SyncEvent,
  sender: { level: NodeLevel; path: string; trustedUpstream: boolean },
): Promise<string | null> {
  if (!RESOURCES[e.resource_type]) return 'unsupported resource';
  const sourceLevel = e.payload.__source_level as NodeLevel | undefined;
  if (!sourceLevel || !(sourceLevel in LEVEL_RANK)) return 'missing source level';
  if (!sender.trustedUpstream) {
    if (LEVEL_RANK[sourceLevel] > LEVEL_RANK[sender.level]) return 'source level above sender';
    const p = e.admin_unit_path ?? '';
    if (!(p === sender.path || p.startsWith(`${sender.path}.`))) return 'event outside sender scope';
  }
  const rule = await one<{ owner_level: NodeLevel }>(
    tx,
    'SELECT owner_level FROM sync.ownership_rules WHERE resource_type = $1',
    [e.resource_type],
  );
  if (!rule) return 'no ownership rule';
  if (rule.owner_level !== sourceLevel) return `only ${rule.owner_level} nodes may write ${e.resource_type}`;
  return null;
}

async function ensureRefs(tx: Tx, spec: ResourceSpec, row: Record<string, unknown>) {
  for (const col of spec.userRefs ?? []) {
    const id = row[col];
    if (!id) continue;
    // Boshqa tugundagi xodim — tizimga kira olmaydigan "havola" yozuvi sifatida.
    await tx.query(
      `INSERT INTO iam.users (id, external_auth_id, username, full_name, status)
       VALUES ($1::uuid, 'remote:' || $1::text, 'remote-' || $1::text, 'Boshqa tugun xodimi', 'disabled')
       ON CONFLICT (id) DO NOTHING`,
      [id],
    );
  }
  for (const ref of spec.nullableRefs ?? []) {
    if (row[ref.column] && !(await one(tx, `SELECT 1 FROM ${ref.table} WHERE id = $1`, [row[ref.column]]))) {
      row[ref.column] = null;
    }
  }
}

/** Hodisani idempotent tarzda qo'llaydi. "Last write wins" yo'q: versiya mos kelmasa — konflikt. */
export async function applyEvent(tx: Tx, e: SyncEvent): Promise<{ outcome: Outcome; detail?: string }> {
  const spec = RESOURCES[e.resource_type];
  if (e.operation === 'delete') return { outcome: 'skipped', detail: 'deletes are not replicated' };

  const row: Record<string, unknown> = {};
  for (const c of spec.columns) if (c in e.payload) row[c] = e.payload[c];
  if (row.content !== undefined && typeof row.content !== 'string') row.content = JSON.stringify(row.content);
  row.id = e.resource_id;
  if (spec.versioned) row.version = e.new_version;

  if (spec.versioned) {
    const current = await one<{ version: number; data: Record<string, unknown> }>(
      tx,
      `SELECT version, to_jsonb(t) AS data FROM ${spec.table} t WHERE id = $1`,
      [e.resource_id],
    );
    if (current) {
      if (current.version >= e.new_version) return { outcome: 'skipped', detail: 'already up to date' };
      if (e.base_version === null || current.version !== e.base_version) {
        await tx.query(
          `INSERT INTO sync.conflicts (event_id, resource_type, resource_id, local_version, incoming_base_version, local_payload, incoming_payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [e.event_id, e.resource_type, e.resource_id, current.version, e.base_version, JSON.stringify(current.data), JSON.stringify(e.payload)],
        );
        return { outcome: 'conflict', detail: `local v${current.version}, incoming base v${e.base_version}` };
      }
    }
  }

  await ensureRefs(tx, spec, row);
  await upsert(tx, spec, row);
  return { outcome: 'applied' };
}

export async function upsert(tx: Tx, spec: ResourceSpec, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  const values = cols.map((c) => row[c]);
  const placeholders = cols.map((c, i) => (c === 'path' ? `$${i + 1}::ltree` : `$${i + 1}`));
  const key = spec.naturalKey ?? ['id'];
  const updates = cols.filter((c) => !key.includes(c) && c !== 'id').map((c) => `${c} = EXCLUDED.${c}`);
  await tx.query(
    `INSERT INTO ${spec.table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
     ON CONFLICT (${key.join(', ')}) DO ${updates.length ? `UPDATE SET ${updates.join(', ')}` : 'NOTHING'}`,
    values,
  );
}

/** Quyi tugundan kelgan hodisani yuqoriga uzatish uchun outbox'ga ko'chirish (event_id saqlanadi). */
export async function forward(tx: Tx, e: SyncEvent) {
  await tx.query(
    `INSERT INTO sync.sync_events (event_id, source_node_id, resource_type, resource_id, operation, base_version, new_version, payload, admin_unit_path)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::ltree) ON CONFLICT (event_id) DO NOTHING`,
    [e.event_id, e.source_node_id, e.resource_type, e.resource_id, e.operation, e.base_version, e.new_version,
      JSON.stringify(e.payload), e.admin_unit_path],
  );
}
