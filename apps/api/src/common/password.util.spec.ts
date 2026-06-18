import { generatePassword, validatePasswordComplexity } from './password.util';

describe('generatePassword', () => {
  it('generates exactly 8 characters', () => {
    for (let i = 0; i < 20; i++) {
      expect(generatePassword()).toHaveLength(8);
    }
  });

  it('always contains at least one uppercase letter', () => {
    for (let i = 0; i < 20; i++) {
      expect(/[A-Z]/.test(generatePassword())).toBe(true);
    }
  });

  it('always contains at least one lowercase letter', () => {
    for (let i = 0; i < 20; i++) {
      expect(/[a-z]/.test(generatePassword())).toBe(true);
    }
  });

  it('always contains at least one digit', () => {
    for (let i = 0; i < 20; i++) {
      expect(/[0-9]/.test(generatePassword())).toBe(true);
    }
  });

  it('always contains at least one special character', () => {
    for (let i = 0; i < 20; i++) {
      expect(/[!@#$%^&*]/.test(generatePassword())).toBe(true);
    }
  });

  it('generates different values (not deterministic)', () => {
    const samples = new Set(Array.from({ length: 10 }, () => generatePassword()));
    expect(samples.size).toBeGreaterThan(1);
  });
});

describe('validatePasswordComplexity', () => {
  it('accepts valid 8-char password', () => {
    expect(validatePasswordComplexity('X7#mqa2B')).toBe(true);
  });

  it('rejects password shorter than 8', () => {
    expect(validatePasswordComplexity('X7#mqa2')).toBe(false);
  });

  it('rejects password longer than 8', () => {
    expect(validatePasswordComplexity('X7#mqa2Bx')).toBe(false);
  });

  it('rejects password without uppercase', () => {
    expect(validatePasswordComplexity('x7#mqa2b')).toBe(false);
  });

  it('rejects password without lowercase', () => {
    expect(validatePasswordComplexity('X7#MQA2B')).toBe(false);
  });

  it('rejects password without digit', () => {
    expect(validatePasswordComplexity('X@#mqaZB')).toBe(false);
  });

  it('rejects password without special char', () => {
    expect(validatePasswordComplexity('X7AmqaZB')).toBe(false);
  });
});
