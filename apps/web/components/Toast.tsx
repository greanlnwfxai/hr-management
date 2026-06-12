'use client';

import { useEffect } from 'react';

export type ToastData = { message: string; type: 'success' | 'error' };

type Props = ToastData & { onClose: () => void };

export default function Toast({ message, type, onClose }: Props) {
  useEffect(() => {
    const id = setTimeout(onClose, 4000);
    return () => clearTimeout(id);
  }, [onClose]);

  return (
    <div
      className={`fixed right-4 top-4 z-50 flex max-w-sm items-start gap-3 rounded-lg px-4 py-3 text-sm shadow-lg ${
        type === 'success' ? 'bg-green-700 text-white' : 'bg-red-700 text-white'
      }`}
    >
      <span className="flex-1">{message}</span>
      <button
        onClick={onClose}
        className="mt-0.5 shrink-0 text-white/70 hover:text-white"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
