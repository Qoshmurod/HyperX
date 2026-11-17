import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { APP_CONFIG, AppConfig } from '../../config';
import { AuthPrincipal, DbGrant, grantsFor, isSystem } from '../auth/principal';

export type Tx = PoolClient;

export async function rows<T extends QueryResultRow>(tx: Tx, sql: string, params: unknown[] = []): Promise<T[]> {
  return (await tx.query<T>(sql, params)).rows;
}

export async function one<T extends QueryResultRow>(tx: Tx, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await tx.query<T>(sql, params)).rows[0];
}

@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool: Pool;
  private readonly auditorPool: Pool;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {
    this.pool = new Pool({ connectionString: config.databaseUrl, max: 20 });
    this.auditorPool = new Pool({ connectionString: config.auditorDatabaseUrl, max: 5 });
  }

  async onModuleDestroy() {
    await Promise.all([this.pool.end(), this.auditorPool.end()]);
  }

  private async run<T>(pool: Pool, grants: DbGrant[], fn: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // set_config(..., true) == SET LOCAL: tranzaksiya tugashi bilan bekor bo'ladi.
      await client.query("SELECT set_config('app.grants', $1, true)", [JSON.stringify(grants)]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Foydalanuvchining `permission` bo'yicha grantlari doirasida tranzaksiya. */
  scoped<T>(principal: AuthPrincipal, permission: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const grants = isSystem(principal)
      ? [{ p: this.config.rootPath, c: 'secret' as const }]
      : grantsFor(principal, permission);
    return this.run(this.pool, grants, fn);
  }

  /**
   * Doirani `path` hududi bilan toraytiradi (grantlar kesishmasi): hisobot faqat shu hudud
   * va foydalanuvchi vakolati ikkalasiga ham kiradigan ma'lumotlarni ko'radi.
   */
  scopedTo<T>(principal: AuthPrincipal, permission: string, path: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const base = isSystem(principal) ? [{ p: this.config.rootPath, c: 'secret' as const }] : grantsFor(principal, permission);
    const within = (child: string, parent: string) => child === parent || child.startsWith(`${parent}.`);
    const narrowed = base.flatMap((g) => (within(path, g.p) ? [{ p: path, c: g.c }] : within(g.p, path) ? [g] : []));
    return this.run(this.pool, narrowed, fn);
  }

  /** Tizim vazifalari (scheduler, sync) uchun: butun tugun doirasi. */
  system<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.run(this.pool, [{ p: this.config.rootPath, c: 'secret' }], fn);
  }

  /** Audit jurnalini o'qish faqat auditor DB roli orqali. */
  auditor<T>(principal: AuthPrincipal, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.run(this.auditorPool, grantsFor(principal, 'audit.read'), fn);
  }
}
