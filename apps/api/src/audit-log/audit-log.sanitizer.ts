import { AUDIT_SENSITIVE_KEYS } from './audit-log.types';

function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    if (AUDIT_SENSITIVE_KEYS.has(key.toLowerCase())) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = sanitizeValue(obj[key]);
    }
  }
  return result;
}

function sanitizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === 'object') return sanitizeObject(value as Record<string, unknown>);
  return value;
}

export function sanitizeMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (metadata === null || metadata === undefined) return null;
  return sanitizeObject(metadata);
}
