export default function LoadingState({ message = 'Loading…', testid }: { message?: string; testid?: string }) {
  return (
    <div
      data-testid={testid ?? 'loading-state'}
      className="flex flex-col items-center justify-center py-24 text-zinc-400 dark:text-zinc-500"
    >
      <svg
        className="mb-3 h-8 w-8 animate-spin"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      <span className="text-sm">{message}</span>
    </div>
  );
}
