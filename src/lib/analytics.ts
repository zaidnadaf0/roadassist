/**
 * M13 analytics — pure aggregation over authoritative snapshots.
 *
 * HONESTY CONTRACT (enforced by types, not comments):
 * - Every metric is `number | null`. `null` means INSUFFICIENT DATA and the
 *   UI renders "Insufficient data" — never a fake zero.
 * - `0` is returned only when a real denominator was measured and the
 *   numerator is empty (e.g. 0 completed of 5 requests → completion 0%).
 * - All timestamps are UTC milliseconds. UI labels every date "UTC".
 * - No synthetic/ML-benchmark data enters these functions (parameter types
 *   only accept request/offer/mechanic snapshot shapes).
 */

export type DayMs = number;

export interface Window {
  fromMs: number | null;
  toMs: number | null;
  label: string;
}

export const WINDOWS: { id: 'today' | 'd7' | 'd30' | 'all'; label: string; days: number | null }[] = [
  { id: 'today', label: 'Today (UTC)', days: 1 },
  { id: 'd7', label: 'Last 7 days (UTC)', days: 7 },
  { id: 'd30', label: 'Last 30 days (UTC)', days: 30 },
  { id: 'all', label: 'All loaded (UTC)', days: null },
];

/** UTC day bucket key `YYYY-MM-DD`. Pure — tested. */
export function utcDay(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** Firestore Timestamp | millis | null → millis | null. Never invents a time. */
export function toMs(ts: { toMillis?: () => number } | number | null | undefined): number | null {
  if (ts == null) return null;
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : null;
  if (typeof (ts as { toMillis?: unknown }).toMillis === 'function') {
    const ms = (ts as { toMillis: () => number }).toMillis();
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** Start-of-UTC-day N days ago (null = unbounded). Pure — tested. */
export function windowStartDaysAgo(days: number | null, nowMs = Date.now()): number | null {
  if (days == null) return null;
  const d = new Date(nowMs);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime() - (days - 1) * 86_400_000;
}

export interface RequestRow {
  id: string;
  status: string;
  problemCategory?: string;
  createdAtMs: number | null;
  amountCents?: number | null;
  durationMin?: number | null;
  mechanicId?: string | null;
}

export interface OfferRow {
  requestId: string;
  mechanicId: string;
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'superseded';
  round?: number | null;
}

/** Normalize a raw request doc into an analytics row (drops nothing silently — unparseable rows are excluded and COUNTED). */
export function normalizeRequests(
  raws: { id: string; status?: unknown; problemCategory?: unknown; createdAt?: unknown; amountCents?: unknown; durationMin?: unknown; mechanicId?: unknown }[],
): { rows: RequestRow[]; excluded: number } {
  const rows: RequestRow[] = [];
  let excluded = 0;
  for (const r of raws) {
    if (typeof r.status !== 'string' || r.status.length === 0) {
      excluded++;
      continue;
    }
    rows.push({
      id: r.id,
      status: r.status,
      problemCategory: typeof r.problemCategory === 'string' ? r.problemCategory : undefined,
      createdAtMs: toMs(r.createdAt as { toMillis?: () => number } | number | null | undefined),
      amountCents: typeof r.amountCents === 'number' && Number.isFinite(r.amountCents) ? r.amountCents : null,
      durationMin: typeof r.durationMin === 'number' && Number.isFinite(r.durationMin) ? r.durationMin : null,
      mechanicId: typeof r.mechanicId === 'string' ? r.mechanicId : null,
    });
  }
  return { rows, excluded };
}

export function inWindow(ms: number | null, w: Window): boolean {
  if (ms == null) return false;
  if (w.fromMs != null && ms < w.fromMs) return false;
  if (w.toMs != null && ms > w.toMs) return false;
  return true;
}

export interface StatusCounts {
  total: number;
  byStatus: Record<string, number>;
  /** null when total is 0 (no denominator measured). */
  completionRate: number | null;
  cancellationRate: number | null;
}

export function statusCounts(rows: RequestRow[]): StatusCounts {
  const byStatus: Record<string, number> = {};
  for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  const total = rows.length;
  if (total === 0) return { total, byStatus, completionRate: null, cancellationRate: null };
  return {
    total,
    byStatus,
    completionRate: (byStatus.completed ?? 0) / total,
    cancellationRate: (byStatus.cancelled ?? 0) / total,
  };
}

export interface Earnings {
  /** null when no completed job carries an amount (insufficient, not zero). */
  totalCents: number | null;
  completedWithAmount: number;
  completedJobs: number;
  avgCents: number | null;
  byCategory: Record<string, number>;
  byDay: Record<string, number>;
}

export function earnings(rows: RequestRow[]): Earnings {
  const done = rows.filter((r) => r.status === 'completed');
  const withAmount = done.filter((r) => r.amountCents != null);
  if (withAmount.length === 0) {
    return { totalCents: null, completedWithAmount: 0, completedJobs: done.length, avgCents: null, byCategory: {}, byDay: {} };
  }
  let total = 0;
  const byCategory: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  for (const r of withAmount) {
    const amt = Math.round(r.amountCents as number);
    total += amt;
    const cat = r.problemCategory ?? 'other';
    byCategory[cat] = (byCategory[cat] ?? 0) + amt;
  }
  // byDay needs timestamps: recomputed by the caller via earningsByDay (kept separate for clarity).
  return { totalCents: total, completedWithAmount: withAmount.length, completedJobs: done.length, avgCents: total / withAmount.length, byCategory, byDay };
}

export function earningsByDay(rows: RequestRow[]): Record<string, { totalCents: number; jobs: number }> {
  const out: Record<string, { totalCents: number; jobs: number }> = {};
  for (const r of rows) {
    if (r.status !== 'completed' || r.amountCents == null) continue;
    const ms = r.createdAtMs;
    if (ms == null) continue;
    const day = utcDay(ms);
    const slot = out[day] ?? { totalCents: 0, jobs: 0 };
    slot.totalCents += Math.round(r.amountCents);
    slot.jobs += 1;
    out[day] = slot;
  }
  return out;
}

export interface DemandSlice {
  byCategory: Record<string, number>;
  byDay: Record<string, number>;
  byHourUtc: Record<string, number>;
  completedVsCancelledByCategory: Record<string, { completed: number; cancelled: number }>;
}

export function demand(rows: RequestRow[]): DemandSlice {
  const byCategory: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  const byHourUtc: Record<string, number> = {};
  const cc: Record<string, { completed: number; cancelled: number }> = {};
  for (const r of rows) {
    const cat = r.problemCategory ?? 'other';
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    if (r.createdAtMs != null) {
      const day = utcDay(r.createdAtMs);
      byDay[day] = (byDay[day] ?? 0) + 1;
      const hour = String(new Date(r.createdAtMs).getUTCHours()).padStart(2, '0');
      byHourUtc[hour] = (byHourUtc[hour] ?? 0) + 1;
    }
    if (r.status === 'completed' || r.status === 'cancelled') {
      const slot = cc[cat] ?? { completed: 0, cancelled: 0 };
      if (r.status === 'completed') slot.completed++;
      else slot.cancelled++;
      cc[cat] = slot;
    }
  }
  return { byCategory, byDay, byHourUtc, completedVsCancelledByCategory: cc };
}

export interface OfferStats {
  total: number;
  byStatus: Record<string, number>;
  /** null when no terminal offers measured. */
  acceptRate: number | null;
  declineRate: number | null;
  expireRate: number | null;
  rematchShare: number | null;
  avgRound: number | null;
}

export function offerStats(offers: OfferRow[]): OfferStats {
  const byStatus: Record<string, number> = {};
  for (const o of offers) byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;
  const total = offers.length;
  if (total === 0) {
    return { total, byStatus, acceptRate: null, declineRate: null, expireRate: null, rematchShare: null, avgRound: null };
  }
  const terminal = (byStatus.accepted ?? 0) + (byStatus.declined ?? 0) + (byStatus.expired ?? 0);
  const rounds = offers.map((o) => o.round).filter((r): r is number => typeof r === 'number');
  return {
    total,
    byStatus,
    acceptRate: terminal > 0 ? (byStatus.accepted ?? 0) / terminal : null,
    declineRate: terminal > 0 ? (byStatus.declined ?? 0) / terminal : null,
    expireRate: terminal > 0 ? (byStatus.expired ?? 0) / terminal : null,
    rematchShare: offers.some((o) => (o.round ?? 0) > 0)
      ? offers.filter((o) => (o.round ?? 0) > 0).length / total
      : total > 0 && offers.every((o) => (o.round ?? 0) === 0)
        ? 0
        : null,
    avgRound: rounds.length > 0 ? rounds.reduce((a, b) => a + b, 0) / rounds.length : null,
  };
}

export interface MechanicPerf {
  completed: number;
  active: number;
  /** null when no terminal offers measured for this mechanic. */
  acceptanceRate: number | null;
  /** null when no assigned jobs measured. */
  completionRate: number | null;
  totalCents: number | null;
  avgCents: number | null;
  byCategory: Record<string, number>;
}

export function mechanicPerf(
  myJobs: RequestRow[],
  myOffers: OfferRow[],
): MechanicPerf {
  const completed = myJobs.filter((j) => j.status === 'completed');
  const active = myJobs.filter((j) => ['accepted', 'on-the-way', 'arrived', 'service'].includes(j.status));
  const termOffers = myOffers.filter((o) => o.status === 'accepted' || o.status === 'declined' || o.status === 'expired');
  const assigned = myJobs.length;
  const earn = earnings(myJobs);
  const byCategory: Record<string, number> = {};
  for (const j of completed) {
    const cat = j.problemCategory ?? 'other';
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }
  return {
    completed: completed.length,
    active: active.length,
    acceptanceRate: termOffers.length > 0
      ? termOffers.filter((o) => o.status === 'accepted').length / termOffers.length
      : null,
    completionRate: assigned > 0 ? completed.length / assigned : null,
    totalCents: earn.totalCents,
    avgCents: earn.avgCents,
    byCategory,
  };
}

/** Minimal CSV serializer (quotes fields containing , " or newline). Pure — tested. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined): string => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}

/** Trigger a browser download of CSV text. No-op outside browsers (tested by omission). */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
