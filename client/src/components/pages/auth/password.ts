/**
 * The password rule the server enforces (see `server/validators/authValidators.js`).
 * Sign-up and password reset both check it client-side so the failure arrives
 * before a round trip, and both read it from here so they cannot disagree.
 */
export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /\d/.test(password) &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[^a-zA-Z0-9]/.test(password)
  );
}

export const PASSWORD_RULE_HINT =
  'At least 8 characters, with upper and lower case, a number and a symbol.';
