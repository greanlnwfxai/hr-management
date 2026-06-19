import { randomInt } from 'crypto';

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghjkmnpqrstuvwxyz';
const DIGITS = '23456789';
const SPECIAL = '!@#$%^&*';
const ALL = UPPER + LOWER + DIGITS + SPECIAL;

function secureChoice(chars: string): string {
  return chars[randomInt(chars.length)];
}

function secureShuffle(arr: string[]): string[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generatePassword(): string {
  const required = [
    secureChoice(UPPER),
    secureChoice(LOWER),
    secureChoice(DIGITS),
    secureChoice(SPECIAL),
  ];
  const filler = Array.from({ length: 4 }, () => secureChoice(ALL));
  return secureShuffle([...required, ...filler]).join('');
}

export function validatePasswordComplexity(password: string): boolean {
  if (password.length < 8) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[!@#$%^&*]/.test(password)) return false;
  return true;
}
