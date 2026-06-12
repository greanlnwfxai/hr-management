type Props = {
  message?: string;
  status?: number;
  onRetry?: () => void;
};

export default function ErrorState({ message = 'Something went wrong.', status, onRetry }: Props) {
  if (status === 403) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
        <p className="font-medium text-amber-800">Access Denied</p>
        <p className="mt-1 text-sm text-amber-600">
          You don't have permission to view this resource.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
      <p className="font-medium text-red-800">Error</p>
      <p className="mt-1 text-sm text-red-600">{message}</p>
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
