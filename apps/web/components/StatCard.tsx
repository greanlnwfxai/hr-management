type Props = {
  label: string;
  value: number | string;
  sub?: string;
  testid?: string;
};

export default function StatCard({ label, value, sub, testid }: Props) {
  return (
    <div data-testid={testid ?? 'stat-card'} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 shadow-sm">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">{sub}</p>}
    </div>
  );
}
