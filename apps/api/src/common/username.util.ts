const USERNAME_REGEX = /^[a-z0-9._-]+$/;

export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function validateUsername(username: string): boolean {
  if (!username || username.trim().length === 0) return false;
  const trimmed = username.trim();
  return USERNAME_REGEX.test(trimmed);
}

export function suggestUsername(firstNameEn?: string | null, lastNameEn?: string | null): string | null {
  if (!firstNameEn || !lastNameEn) return null;
  const first = firstNameEn.trim();
  const last = lastNameEn.trim();
  if (!first || !last) return null;

  // Verify both names contain at least ASCII letters
  if (!/[a-zA-Z]/.test(first) || !/[a-zA-Z]/.test(last)) return null;

  const lastInitial = last[0].toLowerCase();
  const firstPart = first.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (!lastInitial.match(/[a-z]/) || !firstPart) return null;

  return `${lastInitial}.${firstPart}`;
}
