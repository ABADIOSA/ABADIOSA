// Access-code gate for the production (family/friends) app. Each person is
// handed a personal code; entering it once unlocks the app on their device and
// names their local profile. Codes are checked as SHA-256 hashes against an
// admin-controlled list at access.json, so the raw codes never live in the
// bundle, and removing a hash from that list revokes the person on their next
// launch. The admin channel (/admin/) is never gated.

import { IS_ADMIN } from "@/lib/build-info";

const STORE_KEY = "abadiosa.access.v1";

export type AccessEntry = { name: string; hash: string };
export type AccessState = { hash: string; name: string; at: number };

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readState(): AccessState | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as AccessState) : null;
  } catch {
    return null;
  }
}

function writeState(s: AccessState | null): void {
  try {
    if (s) localStorage.setItem(STORE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORE_KEY);
  } catch {
    /* ignore */
  }
}

export function unlockedName(): string | null {
  return readState()?.name ?? null;
}

async function fetchAllowList(): Promise<AccessEntry[] | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}access.json`, { cache: "no-store" });
    if (!res.ok) return null;
    const json = (await res.json()) as { codes?: AccessEntry[] };
    return Array.isArray(json.codes) ? json.codes : [];
  } catch {
    return null;
  }
}

// Decide whether the app should open. The admin build always passes (unless a
// preview is forced with ?gate=1, so the owner can test the gate on /admin/
// before promoting). Otherwise a previously-entered code is re-validated against
// the current list (so revoked people are locked out) — but if the list can't be
// fetched (offline), a prior unlock is honoured so the app still works on a plane.
export async function evaluateAccess(forceGate = false): Promise<{
  open: boolean;
  name: string | null;
}> {
  if (IS_ADMIN && !forceGate) return { open: true, name: null };
  const state = readState();
  if (!state) return { open: false, name: null };
  const list = await fetchAllowList();
  if (list === null) return { open: true, name: state.name }; // offline grace
  const match = list.find((e) => e.hash === state.hash);
  if (!match) {
    writeState(null);
    return { open: false, name: null };
  }
  if (match.name !== state.name) writeState({ ...state, name: match.name });
  return { open: true, name: match.name };
}

// Try a code the user typed. On success the unlock is persisted and their name
// (assigned by the admin when the code was generated) is returned.
export async function tryCode(code: string): Promise<{ ok: boolean; name?: string }> {
  const trimmed = code.trim();
  if (!trimmed) return { ok: false };
  const list = await fetchAllowList();
  if (!list) return { ok: false };
  const hash = await sha256Hex(trimmed);
  const match = list.find((e) => e.hash === hash);
  if (!match) return { ok: false };
  writeState({ hash, name: match.name, at: Date.now() });
  return { ok: true, name: match.name };
}
