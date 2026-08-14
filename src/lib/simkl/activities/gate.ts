import { simklRequest } from "../client";

// SIMKL rule: never call /sync/all-items without first checking /sync/activities.
// This is a shared, briefly-cached read of the global `activities.all` watermark so the
// full-library readers (list-status, watchlist, history) can skip a full pull when nothing
// changed. On any failure it returns null and the caller falls back to pulling (fail-open).

let cachedAll: string | null = null;
let cachedAt = 0;
const GATE_TTL_MS = 20000;

export async function currentActivitiesAll(): Promise<string | null> {
  const now = Date.now();
  if (cachedAll !== null && now - cachedAt < GATE_TTL_MS) return cachedAll;
  try {
    const a = await simklRequest<{ all?: string }>("/sync/activities");
    if (a && typeof a.all === "string") {
      cachedAll = a.all;
      cachedAt = now;
    }
  } catch {
    /* fail-open: caller pulls */
  }
  return cachedAll;
}

export function resetActivitiesGate(): void {
  cachedAll = null;
  cachedAt = 0;
}
