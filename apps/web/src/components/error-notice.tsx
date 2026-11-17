import { Notice } from './ui';
import { errorKey } from '@/lib/form';
import { getT } from '@/lib/i18n';

export async function ErrorNotice({ code }: { code?: string }) {
  const key = errorKey(code);
  if (!key) return null;
  const { t } = await getT();
  return (
    <div className="mb-4">
      <Notice tone="danger">{t(key)}</Notice>
    </div>
  );
}
