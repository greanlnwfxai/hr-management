export function isTokenExpired(token: string, bufferSeconds = 60): boolean {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return true;

    // base64url → base64 (JWT uses URL-safe alphabet)
    const base64 = (parts[1] ?? '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

    const decoded = atob(padded);
    const payload = JSON.parse(decoded) as Record<string, unknown>;

    const exp = payload['exp'];
    if (typeof exp !== 'number') return true;

    // exp is seconds since Unix epoch; subtract buffer to catch near-expiry tokens
    return Date.now() >= (exp - bufferSeconds) * 1000;
  } catch {
    // malformed token → treat as expired
    return true;
  }
}
