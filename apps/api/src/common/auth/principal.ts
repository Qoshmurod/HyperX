import { Classification, RoleGrant, classificationAllows, isGrantActive, isWithinScope } from './access-policy';

export type PrincipalKind = 'user' | 'api_client' | 'node' | 'system';

export interface AuthPrincipal {
  kind: PrincipalKind;
  /** iam.users.id (foydalanuvchi uchun) yoki api_client/node identifikatori. */
  id: string;
  /** Audit uchun actor_id: foydalanuvchi bo'lsa user id, aks holda null. */
  actorId: string | null;
  displayName: string;
  username?: string;
  grants: RoleGrant[];
}

/** RLS uchun `app.grants` qiymati: faqat kerakli ruxsatga ega, amaldagi grantlar. */
export interface DbGrant {
  p: string;
  c: Classification;
}

export function grantsFor(principal: AuthPrincipal, permission: string, now = new Date()): DbGrant[] {
  return principal.grants
    .filter((g) => isGrantActive(g, now) && g.permissions.includes(permission))
    .map((g) => ({ p: g.scopePath, c: g.maxClassification }));
}

export function hasPermission(principal: AuthPrincipal, permission: string, now = new Date()): boolean {
  return grantsFor(principal, permission, now).length > 0;
}

/** Foydalanuvchi `path` hududida `permission` bilan `classification` darajasigacha amal qila oladimi. */
export function canAt(
  principal: AuthPrincipal,
  permission: string,
  path: string,
  classification: Classification = 'public',
  now = new Date(),
): boolean {
  return grantsFor(principal, permission, now).some(
    (g) => isWithinScope(path, g.p) && classificationAllows(g.c, classification),
  );
}

export function permissionsOf(principal: AuthPrincipal, now = new Date()): string[] {
  const set = new Set<string>();
  for (const g of principal.grants) if (isGrantActive(g, now)) g.permissions.forEach((p) => set.add(p));
  return [...set].sort();
}

export function systemPrincipal(rootPath: string): AuthPrincipal {
  return {
    kind: 'system',
    id: 'system',
    actorId: null,
    displayName: 'system',
    grants: [
      {
        role: 'system',
        permissions: ['*'],
        scopePath: rootPath,
        maxClassification: 'secret',
        validFrom: new Date(0),
      },
    ],
  };
}

export function isSystem(principal: AuthPrincipal): boolean {
  return principal.kind === 'system';
}
