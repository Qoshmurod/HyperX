'use client';

import { useEffect, useState } from 'react';

/** URL fragmentidagi bir martalik maxfiy qiymatni ko'rsatadi va darhol manzildan o'chiradi. */
export function FragmentSecret({ name, label }: { name: string; label: string }) {
  const [value, setValue] = useState<string | null>(null);
  useEffect(() => {
    const m = new URLSearchParams(window.location.hash.slice(1)).get(name);
    if (m) {
      setValue(m);
      history.replaceState(null, '', window.location.pathname + window.location.search.replace(/[?&](registered|created)=1/, ''));
    }
  }, [name]);
  if (!value) return null;
  return (
    <div className="rounded-md border border-warn p-3 text-sm">
      <div className="mb-1 text-warn">{label}</div>
      <code className="block break-all rounded bg-surface-2 p-2 text-xs">{value}</code>
    </div>
  );
}
