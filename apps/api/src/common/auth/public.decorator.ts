import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'govmind:isPublic';
export const REQUIRED_PERMISSION_KEY = 'govmind:requiredPermission';

/** Autentifikatsiyasiz ochiq endpoint (faqat health kabi). Ehtiyotkorlik bilan ishlating. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Endpoint uchun talab qilinadigan ruxsat (RBAC). Hudud/maxfiylik tekshiruvi servis qatlamida. */
export const RequirePermission = (permission: string) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);
