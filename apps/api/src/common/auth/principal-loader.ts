import { Injectable } from '@nestjs/common';
import { Classification, RoleGrant } from './access-policy';
import { AuthPrincipal } from './principal';
import { DbService, one, rows } from '../db/db.service';
import { AuditService } from '../audit/audit.service';
import { safeEqualHex, sha256 } from '../crypto/crypto.service';
import { VerifiedToken } from './token-verifier';

interface GrantRow {
  role: string;
  path: string;
  max_classification: Classification;
  valid_from: Date;
  valid_until: Date | null;
  permissions: string[];
}

@Injectable()
export class PrincipalLoader {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Token egasini GovMind foydalanuvchisiga moslaydi. Administrator yaratgan, hali bog'lanmagan
   * hisob (`pending:<username>`) birinchi kirishda Keycloak `sub` ga bog'lanadi.
   */
  async fromToken(token: VerifiedToken): Promise<AuthPrincipal | null> {
    return this.db.system(async (tx) => {
      let user = await one<{ id: string; full_name: string; username: string; status: string }>(
        tx,
        'SELECT id, full_name, username, status FROM iam.users WHERE external_auth_id = $1',
        [token.sub],
      );
      if (!user && token.username) {
        user = await one(
          tx,
          `UPDATE iam.users SET external_auth_id = $1
           WHERE external_auth_id = 'pending:' || $2 AND username = $2
           RETURNING id, full_name, username, status`,
          [token.sub, token.username],
        );
        if (user) {
          await this.audit.record(tx, { kind: 'user', id: user.id, actorId: user.id, displayName: user.full_name, grants: [] }, {
            action: 'auth.account_linked',
            resourceType: 'iam.users',
            resourceId: user.id,
          });
        }
      }
      if (!user || user.status !== 'active') return null;

      const grants = await rows<GrantRow>(
        tx,
        `SELECT r.code AS role, u.path::text AS path, ur.max_classification, ur.valid_from, ur.valid_until,
                COALESCE(array_agg(p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS permissions
         FROM iam.user_roles ur
         JOIN iam.roles r ON r.id = ur.role_id
         JOIN organization.administrative_units u ON u.id = ur.administrative_unit_id
         LEFT JOIN iam.role_permissions rp ON rp.role_id = r.id
         LEFT JOIN iam.permissions p ON p.id = rp.permission_id
         WHERE ur.user_id = $1
         GROUP BY ur.id, r.code, u.path`,
        [user.id],
      );

      return {
        kind: 'user',
        id: user.id,
        actorId: user.id,
        displayName: user.full_name,
        username: user.username,
        grants: grants.map(toGrant),
      };
    });
  }

  async fromApiKey(key: string): Promise<AuthPrincipal | null> {
    const hash = sha256(key);
    return this.db.system(async (tx) => {
      const client = await one<{
        id: string;
        name: string;
        key_hash: string;
        permissions: string[];
        max_classification: Classification;
        path: string;
      }>(
        tx,
        `UPDATE integration.api_clients c SET last_used_at = now()
         FROM organization.organizations o JOIN organization.administrative_units u ON u.id = o.administrative_unit_id
         WHERE c.key_hash = $1 AND c.status = 'active' AND o.id = c.organization_id
         RETURNING c.id, c.name, c.key_hash, c.permissions, c.max_classification, u.path::text AS path`,
        [hash],
      );
      if (!client || !safeEqualHex(client.key_hash, hash)) return null;
      return {
        kind: 'api_client',
        id: client.id,
        actorId: null,
        displayName: `api:${client.name}`,
        grants: [
          {
            role: 'api_client',
            permissions: client.permissions,
            scopePath: client.path,
            maxClassification: client.max_classification,
            validFrom: new Date(0),
          },
        ],
      };
    });
  }

  async fromNodeToken(token: string): Promise<AuthPrincipal | null> {
    const hash = sha256(token);
    return this.db.system(async (tx) => {
      const node = await one<{ node_id: string; level: string; path: string }>(
        tx,
        `UPDATE sync.nodes SET last_seen_at = now() WHERE token_hash = $1 AND status = 'active'
         RETURNING node_id, level, admin_unit_path::text AS path`,
        [hash],
      );
      if (!node) return null;
      return {
        kind: 'node',
        id: node.node_id,
        actorId: null,
        displayName: `node:${node.node_id}:${node.level}`,
        grants: [
          {
            role: `node_${node.level}`,
            permissions: ['sync.exchange'],
            scopePath: node.path,
            maxClassification: 'secret',
            validFrom: new Date(0),
          },
        ],
      };
    });
  }
}

function toGrant(r: GrantRow): RoleGrant {
  return {
    role: r.role,
    permissions: r.permissions,
    scopePath: r.path,
    maxClassification: r.max_classification,
    validFrom: new Date(r.valid_from),
    validUntil: r.valid_until ? new Date(r.valid_until) : undefined,
  };
}
