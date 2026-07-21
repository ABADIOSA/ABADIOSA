// A small persistent ring buffer of the most recent errors seen on this device.
// It powers the admin dashboard and (when a report endpoint is configured) the
// crash-report feed the owner watches. Everything is best-effort: storage may be
// unavailable (private mode, quota) and must never itself throw into the app.

export type LoggedError = {
  id: string;
  at: number; // epoch ms
  kind: "crash" | "runtime" | "rejection" | "manual";
  code: string;
  message: string;
  detail?: string;
  channel: "stable" | "admin";
  version: string;
  url: string;
};

const KEY = "abadiosa.errorlog.v1";
const MAX = 50;

function read(): LoggedError[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LoggedError[]) : [];
  } catch {
    return [];
  }
}

function write(list: LoggedError[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    // storage full or unavailable — drop silently.
  }
  try {
    window.dispatchEvent(new CustomEvent("abadiosa:errorlog"));
  } catch {
    /* no-op */
  }
}

// A short signature so an error that fires in a tight loop isn't recorded dozens
// of times in a row.
let lastSig = "";
let lastSigAt = 0;

export function recordError(entry: Omit<LoggedError, "id" | "at">): LoggedError | null {
  const sig = `${entry.kind}|${entry.code}|${entry.message}`;
  const now = Date.now();
  if (sig === lastSig && now - lastSigAt < 4000) return null;
  lastSig = sig;
  lastSigAt = now;

  const logged: LoggedError = {
    ...entry,
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: now,
  };
  const list = read();
  list.push(logged);
  write(list);
  return logged;
}

export function readErrors(): LoggedError[] {
  return read().slice().reverse(); // newest first
}

export function clearErrors(): void {
  write([]);
}
