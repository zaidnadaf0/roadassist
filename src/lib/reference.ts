/**
 * Presentation references and date formatting.
 *
 * WHY THIS EXISTS — the clipped-identifier defect:
 *   References used to be `id.slice(-6).toUpperCase()`. For seeded/operational
 *   ids such as `emul-req-complete`, `emul-req-history-02` or `demo-request-
 *   pending` that renders as "#MPLETE", "#ORY-02", "#ENDING": the leading
 *   characters are silently dropped and the tail spells a *different word*.
 *   It was never CSS clipping — it was a malformed reference derivation.
 *
 * The reference below is derived from the WHOLE id with a deterministic 32-bit
 * FNV-1a hash rendered in base36. It is:
 *   - complete   — no substring of the id is ever dropped;
 *   - stable     — same id always yields the same reference, across sessions;
 *   - collision-resistant within one screen (36^6 ≈ 2.2e9 buckets);
 *   - honest     — it never invents a date, amount or status.
 * Callers should attach the raw id as a `title` when the reference is shown.
 */

/** Deterministic 32-bit FNV-1a. Pure. */
export function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Uppercase base36 code of a value's hash, fixed width. Pure. */
export function shortRef(value: string | null | undefined, size = 6): string {
  if (!value) return '—';
  const raw = fnv1a(value).toString(36).toUpperCase();
  return raw.padStart(size, '0').slice(-size);
}

/** Customer-facing request reference, e.g. `RA-9F3K2A`. Pure. */
export function requestRef(id: string | null | undefined): string {
  return id ? `RA-${shortRef(id)}` : 'RA-——';
}

/** Firestore Timestamp | epoch millis | ISO string → epoch millis. Never invents a time. */
export function toMillis(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    const ms = (value as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/**
 * UTC label for a timestamp, or null when the value is genuinely unknown —
 * callers render '—' rather than inventing a date.
 */
export function formatUtc(
  value: unknown,
  opts: { dateStyle?: 'short' | 'medium'; timeStyle?: 'short' } = {},
): string | null {
  const ms = toMillis(value);
  if (ms == null) return null;
  return new Date(ms).toLocaleString('en-IN', {
    timeZone: 'UTC',
    dateStyle: opts.dateStyle ?? 'medium',
    timeStyle: opts.timeStyle ?? 'short',
  });
}

/** Currency from integer cents; null-safe, never fabricates a value. */
export function formatInr(cents: number | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return `₹${(cents / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}
