// Shared password policy — mirrors the server-side Supabase Auth policy
// (min length 8, complexity, HIBP). Imported by /signup and /reset-password
// so the client never accepts a password the server would reject.
//
// scorePassword() returns 0..4. A score of >= 3 satisfies the policy:
//   - length >= 8           (+1)
//   - length >= 12          (+1)
//   - upper AND lower mix   (+1)
//   - digit AND symbol      (+1)
// Anything below 3 is rejected client-side.

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_MIN_SCORE = 3;

export function scorePassword(pw: string): PasswordScore {
  let s = 0;
  if (pw.length >= PASSWORD_MIN_LENGTH) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4) as PasswordScore;
}

export const PASSWORD_REQUIREMENT_MESSAGE =
  "Use 8+ characters with upper & lower case, a number, and a symbol.";

/** Returns true if the password meets the shared client/server policy. */
export function meetsPasswordPolicy(pw: string): boolean {
  return (
    pw.length >= PASSWORD_MIN_LENGTH &&
    pw.length <= PASSWORD_MAX_LENGTH &&
    scorePassword(pw) >= PASSWORD_MIN_SCORE
  );
}
