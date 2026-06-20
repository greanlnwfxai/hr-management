export interface AuditLogEvent {
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  targetLabel?: string | null;
  result: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export const AUDIT_SENSITIVE_KEYS = new Set([
  'password',
  'currentpassword',
  'newpassword',
  'confirmpassword',
  'passwordhash',
  'hash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'temporarypassword',
  'temppassword',
  'secret',
  'apikey',
]);
