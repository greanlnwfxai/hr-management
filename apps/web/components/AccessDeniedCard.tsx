'use client';

import Link from 'next/link';
import { useLanguage } from '@/hooks/useLanguage';

type Props = {
  backHref?: string;
  testid?: string;
};

export default function AccessDeniedCard({ backHref = '/dashboard', testid = 'access-denied' }: Props) {
  const { t } = useLanguage();

  return (
    <div data-testid={testid} className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">{t('access_denied_title')}</p>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t('access_denied_detail')}</p>
      <Link href={backHref} className="mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline">
        {t('access_denied_back_link')}
      </Link>
    </div>
  );
}
