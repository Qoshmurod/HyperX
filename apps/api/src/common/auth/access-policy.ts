/**
 * RBAC + ABAC siyosatining yadrosi (sof funksiyalar, framework'ga bog'liq emas).
 *
 * RBAC: foydalanuvchida kerakli ruxsat (permission) bormi.
 * ABAC: ruxsat qaysi hudud doirasida berilgan, maxfiylik darajasi va amal qilish muddati.
 */

export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'secret'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

/** Bitta rol tayinlovi: rol ruxsatlari + u amal qiladigan hudud. */
export interface RoleGrant {
  role: string;
  permissions: readonly string[];
  /** Hudud yo'li (ltree), masalan `uz.toshkent_v.chirchiq`. */
  scopePath: string;
  maxClassification: Classification;
  validFrom: Date;
  validUntil?: Date;
}

export interface Principal {
  userId: string;
  grants: readonly RoleGrant[];
}

export interface ResourceRef {
  /** Resurs tegishli tashkilot hududining yo'li. */
  adminUnitPath: string;
  classification: Classification;
}

export type AccessDecision =
  | { allowed: true; grant: RoleGrant }
  | { allowed: false; reason: 'no_permission' | 'out_of_scope' | 'classification' | 'expired' };

/** `child` hududi `ancestor` hududining o'zi yoki uning ichidami (ltree `<@` semantikasi). */
export function isWithinScope(child: string, ancestor: string): boolean {
  if (!child || !ancestor) return false;
  return child === ancestor || child.startsWith(`${ancestor}.`);
}

export function classificationAllows(max: Classification, actual: Classification): boolean {
  return CLASSIFICATIONS.indexOf(actual) <= CLASSIFICATIONS.indexOf(max);
}

export function isGrantActive(grant: RoleGrant, now: Date): boolean {
  return grant.validFrom <= now && (grant.validUntil === undefined || now < grant.validUntil);
}

/**
 * Foydalanuvchi resurs ustida amal bajara oladimi.
 * Rad etish sababi eng "yaqin" muvaffaqiyatsizlikni ko'rsatadi (audit va diagnostika uchun).
 */
export function decide(
  principal: Principal,
  permission: string,
  resource: ResourceRef,
  now: Date = new Date(),
): AccessDecision {
  const withPermission = principal.grants.filter((g) => g.permissions.includes(permission));
  if (withPermission.length === 0) return { allowed: false, reason: 'no_permission' };

  const active = withPermission.filter((g) => isGrantActive(g, now));
  if (active.length === 0) return { allowed: false, reason: 'expired' };

  const inScope = active.filter((g) => isWithinScope(resource.adminUnitPath, g.scopePath));
  if (inScope.length === 0) return { allowed: false, reason: 'out_of_scope' };

  const grant = inScope.find((g) => classificationAllows(g.maxClassification, resource.classification));
  if (!grant) return { allowed: false, reason: 'classification' };

  return { allowed: true, grant };
}
