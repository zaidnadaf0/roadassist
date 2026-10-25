/**
 * M2 user-facing auth error mapping.
 *
 * Firebase error codes are developer-facing (`auth/invalid-credential`).
 * Every auth call throws `Error(mappedMessage)` so screens render exactly
 * one safe string. Pure — unit-tested. No implementation details leak.
 */

const MESSAGES: Record<string, string> = {
  'auth/email-already-in-use': 'An account with this email already exists. Try logging in instead.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/weak-password': 'Use a password of at least 6 characters.',
  'auth/invalid-credential': 'Incorrect email or password. Check both and try again.',
  'auth/wrong-password': 'Incorrect email or password. Check both and try again.',
  'auth/user-not-found': 'Incorrect email or password. Check both and try again.',
  'auth/user-disabled': 'This account has been disabled. Contact RoadAssist support.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Network problem. Check your connection and retry.',
  'auth/operation-not-allowed': 'Email sign-in is not enabled for this project. Contact support.',
  'auth/missing-email': 'Enter your email address first.',
  'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups and retry.',
  'auth/requires-recent-login': 'For security, log in again to continue.',
};

export const FALLBACK_AUTH_MESSAGE = 'Something went wrong. Please try again in a moment.';

/** Extract a Firebase-style `code` from an unknown thrown value. */
export function toAuthCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  return 'unknown';
}

/** Map any thrown auth failure to exactly one safe user-facing string. */
export function mapAuthError(err: unknown): string {
  return MESSAGES[toAuthCode(err)] ?? FALLBACK_AUTH_MESSAGE;
}
