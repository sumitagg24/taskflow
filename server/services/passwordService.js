// Common passwords that should be rejected
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456', '1234567', '12345678', '123456789',
  '1234567890', 'qwerty', 'qwerty123', 'abc123', 'letmein', 'welcome', 'monkey',
  'dragon', 'master', 'shadow', 'sunshine', 'princess', 'football', 'baseball',
  'iloveyou', 'trustno1', 'hunter', 'ranger', 'starwars', 'passw0rd', 'admin',
  'administrator', 'login', 'hello', 'pass', 'password!', 'p@ssw0rd', 'pass123',
  'changeme', 'secret', 'test', 'test123', 'testing', 'guest',
  'unknown', 'user', 'user123', 'default', 'temp', 'temp123',
  'password1$',
]);

const MIN_PASSWORD_LENGTH = 8;

const hasUpperCase = (s) => /[A-Z]/.test(s);
const hasLowerCase = (s) => /[a-z]/.test(s);
const hasNumber = (s) => /\d/.test(s);
const hasSpecialChar = (s) => /[^a-zA-Z0-9]/.test(s);

const passwordStrength = (password) => {
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score++;
  if (password.length >= 12) score++;
  if (hasUpperCase(password) && hasLowerCase(password)) score++;
  if (hasNumber(password)) score++;
  if (hasSpecialChar(password)) score++;
  return score;
};

const isStrongPassword = (password) => {
  if (!password || password.length < MIN_PASSWORD_LENGTH) return false;
  if (isCommonPassword(password)) return false;
  return hasUpperCase(password) && hasLowerCase(password) && hasNumber(password) && hasSpecialChar(password);
};

const isCommonPassword = (password) => {
  return COMMON_PASSWORDS.has(password.toLowerCase().trim());
};

const getPasswordErrors = (password, { requireCurrentPassword } = {}) => {
  const errors = [];
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }
  if (!hasUpperCase(password)) errors.push('Password must contain an uppercase letter');
  if (!hasLowerCase(password)) errors.push('Password must contain a lowercase letter');
  if (!hasNumber(password)) errors.push('Password must contain a number');
  if (!hasSpecialChar(password)) errors.push('Password must contain a special character');
  if (isCommonPassword(password)) errors.push('This password is too common');
  return errors;
};

module.exports = {
  COMMON_PASSWORDS,
  MIN_PASSWORD_LENGTH,
  passwordStrength,
  isStrongPassword,
  isCommonPassword,
  getPasswordErrors,
};
