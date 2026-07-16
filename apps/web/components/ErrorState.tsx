'use client';

import { useLanguage } from '@/hooks/useLanguage';

type Props = {
  message?: string;
  status?: number;
  onRetry?: () => void;
  testid?: string;
};

export default function ErrorState({ message = 'Something went wrong.', status, onRetry, testid }: Props) {
  const { t } = useLanguage();

  if (status === 403) {
    return (
      <div
        data-testid={testid ?? 'error-state'}
        className="rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-900/20 p-6 text-center"
      >
        <p className="font-medium text-amber-800 dark:text-amber-300">{t('error_access_denied')}</p>
        <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
          {t('error_access_denied_detail')}
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid={testid ?? 'error-state'}
      className="rounded-lg border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/20 p-6 text-center"
    >
      <p className="font-medium text-red-800 dark:text-red-300">Error</p>
      <p className="mt-1 text-sm text-red-600 dark:text-red-400">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700"
        >
          Retry
        </button>
      )}
    </div>
  );
}
