// Color tokens — ready for light/dark mode in a future task.
// Use Colors.light.* or Colors.dark.* depending on the active scheme.
export const Colors = {
  light: {
    background: '#f8f9fa',
    surface: '#ffffff',
    primary: '#1a56db',
    primaryDark: '#1e429f',
    text: '#111827',
    textSecondary: '#6b7280',
    border: '#e5e7eb',
    success: '#16a34a',
    error: '#dc2626',
    warning: '#d97706',
  },
  dark: {
    background: '#111827',
    surface: '#1f2937',
    primary: '#3b82f6',
    primaryDark: '#2563eb',
    text: '#f9fafb',
    textSecondary: '#9ca3af',
    border: '#374151',
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
  },
} as const;

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = (typeof Colors)[ColorScheme];
