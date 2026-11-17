import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Classification } from './auth/access-policy';
import { AuthPrincipal, canAt, isSystem } from './auth/principal';
import { one, Tx } from './db/db.service';

/** Tashkilot hududi yo'li. RLS tufayli ko'rinmaydigan tashkilot uchun 404. */
export async function orgPath(tx: Tx, organizationId: string): Promise<string> {
  const row = await one<{ path: string }>(
    tx,
    `SELECT u.path::text AS path FROM organization.organizations o
     JOIN organization.administrative_units u ON u.id = o.administrative_unit_id WHERE o.id = $1`,
    [organizationId],
  );
  if (!row) throw new NotFoundException('Organization not found');
  return row.path;
}

/** Yozishdan oldin aniq tekshiruv (RLS'ga qo'shimcha, aniq xato xabari uchun). */
export async function assertCanAtOrg(
  tx: Tx,
  principal: AuthPrincipal,
  permission: string,
  organizationId: string,
  classification: Classification = 'public',
): Promise<string> {
  const path = await orgPath(tx, organizationId);
  if (!isSystem(principal) && !canAt(principal, permission, path, classification)) {
    throw new ForbiddenException();
  }
  return path;
}
