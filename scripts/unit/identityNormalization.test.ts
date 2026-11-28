import assert from 'node:assert/strict';
import {
  normalizeGrKey,
  normalizeNadraNumber,
  formatCnicDisplay,
  formatPhoneDisplay,
  getInitials,
  getAvatarGradient,
  normalizePakistaniName,
  validateNadraNumber,
} from '../../services/identityNormalization';

export function runIdentityNormalizationTests(t: {
  describe: (name: string) => void;
  it: (name: string, fn: () => void) => void;
  eq: (actual: unknown, expected: unknown, msg?: string) => void;
}) {
  const { describe, it, eq } = t;

  describe('identityNormalization');

  it('normalizes GR keys across padding, decimals, prefixes, and nulls', () => {
    eq(normalizeGrKey('56'), '56');
    eq(normalizeGrKey(' 056 '), '56');
    eq(normalizeGrKey('56.0'), '56');
    eq(normalizeGrKey('GR-123'), '123');
    eq(normalizeGrKey('unassigned'), 'UNASSIGNED');
    eq(normalizeGrKey(''), '');
    eq(normalizeGrKey(null), '');
  });

  it('normalizes and validates NADRA / CNIC numbers and formats CNIC & phones', () => {
    eq(normalizeNadraNumber('41506-0504781-7'), '4150605047817');
    eq(normalizeNadraNumber('41506 0504781 7'), '4150605047817');

    eq(formatCnicDisplay('4150605047817'), '41506-0504781-7');
    eq(formatCnicDisplay('41506-0504781-7'), '41506-0504781-7');
    eq(formatCnicDisplay('123'), '123');

    eq(formatPhoneDisplay('03001234567'), '0300-1234567');
    eq(formatPhoneDisplay('+923001234567'), '0300-1234567');

    const validSindh = validateNadraNumber('41506-0504781-7');
    eq(validSindh.isValid, true);
    eq(validSindh.provinceCode, 4);
    eq(validSindh.provinceName, 'Sindh');
    eq(validSindh.digits, '4150605047817');

    const invalidShort = validateNadraNumber('41506');
    eq(invalidShort.isValid, false);
  });

  it('derives initials, deterministic avatar gradients, and Pakistani name normalization', () => {
    eq(getInitials('Abdul Ahad'), 'AA');
    eq(getInitials('Muhammad'), 'MU');
    eq(getInitials(''), 'S');

    eq(typeof getAvatarGradient('123'), 'string');
    eq(getAvatarGradient('123'), getAvatarGradient('123'));

    eq(normalizePakistaniName('Syed Muhammad Ahmad Brohi'), 'muhamad ahmed brohi');
    eq(normalizePakistaniName('Mohd. Aly Solangy'), 'muhamad ali solangi');
    eq(normalizePakistaniName(''), '');
  });
}

if (process.argv[1]?.endsWith('identityNormalization.test.ts')) {
  runIdentityNormalizationTests({
    describe: (name) => console.log(`── ${name} ──`),
    it: (name, fn) => {
      fn();
      console.log(`  ✅ ${name}`);
    },
    eq: (actual, expected, msg) => assert.deepStrictEqual(actual, expected, msg),
  });
}
