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


function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(`Assertion failed: ${msg}`);
}

console.log('── identityNormalization.normalizeGrKey ──');
assert(normalizeGrKey('56') === '56', 'plain digits');
assert(normalizeGrKey(' 056 ') === '56', 'leading zero and whitespace');
assert(normalizeGrKey('56.0') === '56', 'decimal suffix');
assert(normalizeGrKey('GR-123') === '123', 'alphanumeric prefix');
assert(normalizeGrKey('unassigned') === 'UNASSIGNED', 'pure text falls back to uppercase');
assert(normalizeGrKey('') === '', 'empty string');
assert(normalizeGrKey(null) === '', 'null input');

console.log('── identityNormalization.normalizeNadraNumber ──');
assert(normalizeNadraNumber('41506-0504781-7') === '4150605047817', 'strips hyphens');
assert(normalizeNadraNumber('41506 0504781 7') === '4150605047817', 'strips spaces');

console.log('── identityNormalization.formatCnicDisplay ──');
assert(formatCnicDisplay('4150605047817') === '41506-0504781-7', 'formats 13 digits');
assert(formatCnicDisplay('41506-0504781-7') === '41506-0504781-7', 'preserves already formatted');
assert(formatCnicDisplay('123') === '123', 'leaves short text');

console.log('── identityNormalization.formatPhoneDisplay ──');
assert(formatPhoneDisplay('03001234567') === '0300-1234567', 'formats 11 digit mobile');
assert(formatPhoneDisplay('+923001234567') === '0300-1234567', 'normalizes +92 prefix');

console.log('── identityNormalization.getInitials ──');
assert(getInitials('Abdul Ahad') === 'AA', 'two words');
assert(getInitials('Muhammad') === 'MU', 'single word');
assert(getInitials('') === 'S', 'empty defaults to S');

console.log('── identityNormalization.getAvatarGradient ──');
assert(typeof getAvatarGradient('123') === 'string', 'returns class string');
assert(getAvatarGradient('123') === getAvatarGradient('123'), 'deterministic');

console.log('── identityNormalization.normalizePakistaniName ──');
assert(normalizePakistaniName('Syed Muhammad Ahmad Brohi') === 'muhamad ahmed brohi', 'normalizes honorific, prefix, surname');
assert(normalizePakistaniName('Mohd. Aly Solangy') === 'muhamad ali solangi', 'standardizes abbreviations and terminal y');
assert(normalizePakistaniName('') === '', 'handles empty string');


console.log('── identityNormalization.validateNadraNumber ──');
const validSindh = validateNadraNumber('41506-0504781-7');
assert(validSindh.isValid === true, 'valid Sindh CNIC is accepted');
assert(validSindh.provinceCode === 4, 'identifies province code 4');
assert(validSindh.provinceName === 'Sindh', 'identifies Sindh province name');
assert(validSindh.digits === '4150605047817', 'extracts clean 13 digits');

const invalidShort = validateNadraNumber('41506');
assert(invalidShort.isValid === false, 'rejects short number');

console.log('All identityNormalization tests passed!');

