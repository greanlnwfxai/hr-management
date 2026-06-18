import { normalizeUsername, validateUsername, suggestUsername } from './username.util';

describe('normalizeUsername', () => {
  it('lowercases and trims', () => {
    expect(normalizeUsername('  J.Pichai  ')).toBe('j.pichai');
  });

  it('lowercases mixed case', () => {
    expect(normalizeUsername('ADMIN')).toBe('admin');
  });
});

describe('validateUsername', () => {
  it('accepts valid usernames', () => {
    expect(validateUsername('j.pichai')).toBe(true);
    expect(validateUsername('admin')).toBe(true);
    expect(validateUsername('user_123')).toBe(true);
    expect(validateUsername('user-name')).toBe(true);
    expect(validateUsername('a1.b2_c3-d4')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(validateUsername('')).toBe(false);
    expect(validateUsername('   ')).toBe(false);
  });

  it('rejects spaces', () => {
    expect(validateUsername('user name')).toBe(false);
  });

  it('rejects Thai characters', () => {
    expect(validateUsername('ชื่อผู้ใช้')).toBe(false);
  });

  it('rejects uppercase letters', () => {
    expect(validateUsername('Admin')).toBe(false);
  });

  it('rejects special chars other than . _ -', () => {
    expect(validateUsername('user@name')).toBe(false);
    expect(validateUsername('user#name')).toBe(false);
  });
});

describe('suggestUsername', () => {
  it('suggests j.pichai for Pichai Jaijit', () => {
    expect(suggestUsername('Pichai', 'Jaijit')).toBe('j.pichai');
  });

  it('lowercases the suggestion', () => {
    expect(suggestUsername('JOHN', 'DOE')).toBe('d.john');
  });

  it('returns null when first name is missing', () => {
    expect(suggestUsername(null, 'Jaijit')).toBeNull();
    expect(suggestUsername('', 'Jaijit')).toBeNull();
  });

  it('returns null when last name is missing', () => {
    expect(suggestUsername('Pichai', null)).toBeNull();
    expect(suggestUsername('Pichai', '')).toBeNull();
  });

  it('returns null when names contain no Latin letters (e.g. Thai only)', () => {
    expect(suggestUsername('ปิชัย', 'ใจจิต')).toBeNull();
  });

  it('handles names with numbers', () => {
    const result = suggestUsername('John2', 'Doe');
    expect(result).toBe('d.john2');
  });
});
