/**
 * M2 user-profile foundation (`users/{uid}`).
 *
 * SECURITY CONTRACT (enforced here, in code, before M3 rules exist):
 * - The ONLY role a client may assign at signup is `customer`.
 * - There is NO code path that writes `admin`, `mechanic`, or any other
 *   privileged role from the client. Mechanic onboarding (with approval)
 *   arrives in a later phase behind server-side checks.
 * - `role` is a UI/profile HINT. Real admin authority will come from the
 *   Firebase ID-token custom claim (`admin === true`, minted server-side
 *   in the backend phase) and Firestore rules in M3.
 */

export const USER_COLLECTION = 'users';

/** The single self-assignable role. Anything else is privilege escalation. */
export const SIGNUP_ROLE = 'customer' as const;

export type ProfileHint = 'customer' | 'mechanic' | 'admin';

export interface NewUserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: typeof SIGNUP_ROLE;
}

/**
 * Build the signup profile document (timestamps are added by the caller
 * with `serverTimestamp()`). Pure — unit-tested, including the negative
 * assertion that no privileged role can be produced.
 */
export function buildNewUserProfile(uid: string, email: string, displayName: string): NewUserProfile {
  return {
    uid,
    email: email.trim().toLowerCase(),
    displayName: displayName.trim(),
    role: SIGNUP_ROLE,
  };
}

/** Validate a role hint read back from Firestore (never trust it blindly). */
export function isProfileHint(value: unknown): value is ProfileHint {
  return value === 'customer' || value === 'mechanic' || value === 'admin';
}

/** Portal home for a role hint. Used for post-login routing convenience only. */
export function homeForHint(role: ProfileHint | null): string {
  if (role === 'mechanic') return '/m';
  if (role === 'admin') return '/admin';
  return '/app';
}
