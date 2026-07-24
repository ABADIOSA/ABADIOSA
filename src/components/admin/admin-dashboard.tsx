import { AlertTriangle, Copy, KeyRound, PackagePlus, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { APP_VERSION, CHANNEL } from "@/lib/build-info";
import { clearErrors, readErrors, type LoggedError } from "@/lib/admin/error-log";
import { reportingEnabled } from "@/lib/admin/report";
import { sha256Hex } from "@/lib/access/gate";
import { exportInstalledAddons, loadAdminVaultKey, saveAdminVaultKey } from "@/lib/access/managed";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import {
  encryptConfig,
  keyFromB64,
  keyToB64,
  makeVaultKey,
  wrapForCode,
  type Slot,
  type VaultBlob,
} from "@/lib/access/vault";

// The owner-only control room, opened from the ADMIN badge on the canary build.
// Everything it shows comes from this device (local error ring buffer + browser
// diagnostics) so it works with no backend; when a report endpoint is wired it
// also confirms that crash reporting is live.
export function AdminDashboard({ onClose }: { onClose: () => void }) {
  const [errors, setErrors] = useState<LoggedError[]>(() => readErrors());
  const [storage, setStorage] = useState<string>("…");

  useEffect(() => {
    const refresh = () => setErrors(readErrors());
    window.addEventListener("abadiosa:errorlog", refresh);
    return () => window.removeEventListener("abadiosa:errorlog", refresh);
  }, []);

  useEffect(() => {
    let alive = true;
    if (navigator.storage?.estimate) {
      navigator.storage
        .estimate()
        .then((e) => {
          if (!alive) return;
          const used = e.usage ?? 0;
          const quota = e.quota ?? 0;
          setStorage(`${fmtBytes(used)}${quota ? ` / ${fmtBytes(quota)}` : ""}`);
        })
        .catch(() => alive && setStorage("n/a"));
    } else {
      setStorage("n/a");
    }
    return () => {
      alive = false;
    };
  }, []);

  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true);

  const health: Array<{ label: string; value: string; ok?: boolean }> = [
    { label: "Channel", value: CHANNEL },
    { label: "Version", value: APP_VERSION },
    { label: "Crash reporting", value: reportingEnabled() ? "on" : "off", ok: reportingEnabled() },
    { label: "Network", value: navigator.onLine ? "online" : "offline", ok: navigator.onLine },
    { label: "Installed (PWA)", value: standalone ? "yes" : "browser" },
    { label: "Storage used", value: storage },
    { label: "Errors logged", value: String(errors.length), ok: errors.length === 0 },
  ];

  const copyDiagnostics = () => {
    const text = [
      `ABADIOSA diagnostics`,
      ...health.map((h) => `${h.label}: ${h.value}`),
      `User agent: ${navigator.userAgent}`,
      ``,
      `Errors (${errors.length}):`,
      ...errors.map(
        (e) =>
          `- [${new Date(e.at).toISOString()}] ${e.kind} ${e.code}: ${e.message}` +
          (e.detail ? `\n${e.detail}` : ""),
      ),
    ].join("\n");
    void navigator.clipboard?.writeText(text).catch(() => {});
  };

  return (
    <div
      className="fixed inset-0 z-[300] flex flex-col bg-canvas/95 backdrop-blur-sm"
      dir="auto"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-edge-soft px-5 py-4">
        <div className="flex items-center gap-2.5">
          <span className="rounded-md bg-accent/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.18em] text-accent ring-1 ring-accent/30">
            Admin
          </span>
          <h1 className="text-[17px] font-semibold text-ink">Control room</h1>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={copyDiagnostics}
            className="flex h-9 items-center gap-1.5 rounded-full bg-elevated px-3.5 text-[12.5px] font-semibold text-ink-muted ring-1 ring-edge-soft transition-colors hover:text-ink"
          >
            <Copy size={14} />
            Copy
          </button>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-elevated hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <section>
            <h2 className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
              Health
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {health.map((h) => (
                <div
                  key={h.label}
                  className="rounded-xl border border-edge-soft/60 bg-elevated/40 px-3.5 py-2.5"
                >
                  <p className="text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
                    {h.label}
                  </p>
                  <p
                    className={`mt-0.5 truncate text-[14px] font-semibold ${
                      h.ok === undefined ? "text-ink" : h.ok ? "text-emerald-300" : "text-amber-300"
                    }`}
                  >
                    {h.value}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <ManagedAccessTool />

          <section>
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
                Recent errors
              </h2>
              {errors.length > 0 && (
                <button
                  onClick={() => {
                    clearErrors();
                    setErrors([]);
                  }}
                  className="flex items-center gap-1.5 text-[12px] font-semibold text-ink-subtle transition-colors hover:text-danger"
                >
                  <Trash2 size={13} />
                  Clear
                </button>
              )}
            </div>
            {errors.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-edge-soft/60 px-5 py-10 text-center text-[13.5px] text-ink-muted">
                No errors captured on this device. 🎉
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {errors.map((e) => (
                  <ErrorRow key={e.id} err={e} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

const DRAFT_KEY = "abadiosa.managed.draft.v1";

type Draft = { vault: VaultBlob | null; slots: Slot[] };

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return JSON.parse(raw) as Draft;
  } catch {
    /* ignore */
  }
  return { vault: null, slots: [] };
}

function saveDraft(d: Draft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}

function newCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const raw = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

// The heart of the encrypted "managed access" flow. Step 1 bakes your installed
// streaming addons into an encrypted vault (the debrid key inside is never
// readable without a valid code). Step 2 mints a personal code per person, whose
// slot unwraps that vault. The output is the full managed.json to commit — once
// deployed, each person's code both lets them in AND installs your addons so they
// can actually watch.
function ManagedAccessTool() {
  const { authKey } = useAuth();
  const { settings } = useSettings();
  const [draft, setDraft] = useState<Draft>(() => loadDraft());
  const [addonCount, setAddonCount] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [expiryDays, setExpiryDays] = useState("");
  const [lastCode, setLastCode] = useState<{ name: string; code: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const hasVault = !!draft.vault && !!loadAdminVaultKey();

  const exportAddons = async () => {
    setBusy(true);
    try {
      const payload = await exportInstalledAddons(authKey, {
        rdKey: settings.rdKey,
        tbKey: settings.tbKey,
        adKey: settings.adKey,
        pmKey: settings.pmKey,
        dlKey: settings.dlKey,
      });
      const key = await makeVaultKey();
      const vault = await encryptConfig(payload, key);
      saveAdminVaultKey(keyToB64(key));
      const next: Draft = { vault, slots: [] }; // new key invalidates old slots
      setDraft(next);
      saveDraft(next);
      setAddonCount(payload.addons.length);
      setLastCode(null);
    } finally {
      setBusy(false);
    }
  };

  const addCode = async () => {
    const keyB64 = loadAdminVaultKey();
    if (!draft.vault || !keyB64) return;
    setBusy(true);
    try {
      const person = name.trim() || "Guest";
      const code = newCode();
      const hash = await sha256Hex(code);
      const slot = await wrapForCode(keyFromB64(keyB64), person, code, hash);
      const days = Number(expiryDays);
      if (Number.isFinite(days) && days > 0) {
        slot.exp = Date.now() + days * 86_400_000;
      }
      const next: Draft = { vault: draft.vault, slots: [...draft.slots, slot] };
      setDraft(next);
      saveDraft(next);
      setLastCode({ name: person, code });
      setName("");
    } finally {
      setBusy(false);
    }
  };

  const renameSlot = (hash: string, newName: string) => {
    const next: Draft = {
      vault: draft.vault,
      slots: draft.slots.map((s) => (s.hash === hash ? { ...s, name: newName } : s)),
    };
    setDraft(next);
    saveDraft(next);
  };

  const setSlotExpiry = (hash: string, days: number | null) => {
    const next: Draft = {
      vault: draft.vault,
      slots: draft.slots.map((s) =>
        s.hash === hash
          ? days === null
            ? { ...s, exp: undefined }
            : { ...s, exp: Date.now() + days * 86_400_000 }
          : s,
      ),
    };
    setDraft(next);
    saveDraft(next);
  };

  const deleteSlot = (hash: string) => {
    const next: Draft = { vault: draft.vault, slots: draft.slots.filter((s) => s.hash !== hash) };
    setDraft(next);
    saveDraft(next);
  };

  const managedJson = draft.vault
    ? JSON.stringify({ v: 1, vault: draft.vault, slots: draft.slots }, null, 2)
    : "";

  return (
    <section>
      <h2 className="mb-2.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
        <KeyRound size={13} />
        Managed access
      </h2>
      <div className="flex flex-col gap-3 rounded-2xl border border-edge-soft/60 bg-elevated/40 p-4">
        <div>
          <p className="mb-1.5 text-[12.5px] font-semibold text-ink">
            1. Link your Stremio account
          </p>
          <button
            onClick={() => void exportAddons()}
            disabled={busy}
            className="flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-[13.5px] font-semibold text-canvas disabled:opacity-50"
          >
            <PackagePlus size={15} />
            {draft.vault ? "Re-link account" : "Link my account"}
          </button>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-subtle">
            Everyone reads your addons live from your Stremio account, so adding or removing an
            addon reaches them automatically — no new codes, no redeploy. Only re-link if you change
            Stremio account or debrid keys (that resets existing codes).
          </p>
          {addonCount !== null && (
            <p className="mt-1.5 text-[12px] text-ink-muted">
              {addonCount === 0
                ? "No addons found — add your streaming addons first."
                : `Linked, with a ${addonCount}-addon fallback snapshot. Codes were reset — mint them again below.`}
            </p>
          )}
        </div>

        <div className="border-t border-edge-soft/40 pt-3">
          <p className="mb-1.5 text-[12.5px] font-semibold text-ink">2. Create an account</p>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Person's name"
              disabled={!hasVault}
              className="h-10 flex-1 rounded-xl border border-edge-soft bg-canvas/60 px-3.5 text-[14px] text-ink outline-none focus:border-accent/60 disabled:opacity-50"
            />
            <input
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value.replace(/\D/g, ""))}
              placeholder="days"
              inputMode="numeric"
              disabled={!hasVault}
              title="Leave empty for a permanent account"
              className="h-10 w-20 rounded-xl border border-edge-soft bg-canvas/60 px-3 text-center text-[14px] text-ink outline-none focus:border-accent/60 disabled:opacity-50"
            />
            <button
              onClick={() => void addCode()}
              disabled={!hasVault || busy}
              className="h-10 shrink-0 rounded-xl bg-ink px-4 text-[13.5px] font-semibold text-canvas disabled:opacity-50"
            >
              Add
            </button>
          </div>
          <p className="mt-1.5 text-[11.5px] text-ink-subtle">
            Leave “days” empty for a permanent account, or enter a number for a temporary one.
          </p>
          {!hasVault && (
            <p className="mt-1.5 text-[12px] text-ink-subtle">Link your account first.</p>
          )}
          {lastCode && (
            <div className="mt-2.5">
              <CopyField
                label={`Code for ${lastCode.name} (give to them)`}
                value={lastCode.code}
                mono
              />
            </div>
          )}
        </div>

        {draft.slots.length > 0 && (
          <div className="border-t border-edge-soft/40 pt-3">
            <p className="mb-2 text-[12.5px] font-semibold text-ink">
              Accounts — {draft.slots.length}
            </p>
            <ul className="flex flex-col gap-1.5">
              {draft.slots.map((s) => (
                <SlotRow
                  key={s.hash}
                  slot={s}
                  onRename={(n) => renameSlot(s.hash, n)}
                  onExpiry={(d) => setSlotExpiry(s.hash, d)}
                  onDelete={() => deleteSlot(s.hash)}
                />
              ))}
            </ul>
          </div>
        )}

        {draft.vault && (
          <div className="border-t border-edge-soft/40 pt-3">
            <p className="mb-1.5 text-[12.5px] font-semibold text-ink">3. Deploy</p>
            <CopyField label="public/managed.json → this" value={managedJson} />
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-ink-subtle">
              Commit this as <code>public/managed.json</code> on the <code>source</code> branch and
              deploy. Only needed when you add, edit or remove an account — addon changes flow
              automatically.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

// One person's account: rename, change or clear the expiry, or delete them
// outright. Deleting revokes their access on their next launch once deployed.
function SlotRow({
  slot,
  onRename,
  onExpiry,
  onDelete,
}: {
  slot: Slot;
  onRename: (name: string) => void;
  onExpiry: (days: number | null) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(slot.name);
  const [days, setDays] = useState("");
  const expired = typeof slot.exp === "number" && Date.now() > slot.exp;
  const daysLeft =
    typeof slot.exp === "number" ? Math.ceil((slot.exp - Date.now()) / 86_400_000) : null;

  return (
    <li className="rounded-xl border border-edge-soft/60 bg-canvas/50 px-3 py-2.5">
      <div className="flex items-center gap-2">
        {editing ? (
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => {
              const n = draftName.trim();
              if (n && n !== slot.name) onRename(n);
              setEditing(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            autoFocus
            className="h-8 min-w-0 flex-1 rounded-lg border border-accent/50 bg-canvas px-2 text-[13.5px] text-ink outline-none"
          />
        ) : (
          <button
            onClick={() => {
              setDraftName(slot.name);
              setEditing(true);
            }}
            className="min-w-0 flex-1 truncate text-start text-[13.5px] font-semibold text-ink"
          >
            {slot.name}
          </button>
        )}
        <span
          className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider ${
            expired
              ? "bg-danger/15 text-danger"
              : daysLeft !== null
                ? "bg-amber-400/15 text-amber-300"
                : "bg-emerald-400/12 text-emerald-300"
          }`}
        >
          {expired ? "expired" : daysLeft !== null ? `${daysLeft}d left` : "permanent"}
        </span>
        <button
          onClick={onDelete}
          aria-label={`Delete ${slot.name}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-subtle transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <input
          value={days}
          onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))}
          placeholder="days"
          inputMode="numeric"
          className="h-8 w-16 rounded-lg border border-edge-soft bg-canvas/60 px-2 text-center text-[12.5px] text-ink outline-none focus:border-accent/60"
        />
        <button
          onClick={() => {
            const n = Number(days);
            if (Number.isFinite(n) && n > 0) {
              onExpiry(n);
              setDays("");
            }
          }}
          className="h-8 rounded-lg bg-elevated px-2.5 text-[12px] font-semibold text-ink-muted ring-1 ring-edge-soft transition-colors hover:text-ink"
        >
          Set expiry
        </button>
        {slot.exp != null && (
          <button
            onClick={() => onExpiry(null)}
            className="h-8 rounded-lg px-2.5 text-[12px] font-semibold text-ink-subtle transition-colors hover:text-ink"
          >
            Make permanent
          </button>
        )}
      </div>
    </li>
  );
}

function CopyField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-ink-subtle">
        {label}
      </p>
      <button
        onClick={() => {
          void navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          });
        }}
        className="flex w-full items-center gap-2 rounded-xl border border-edge-soft/60 bg-canvas/50 px-3 py-2 text-start transition-colors hover:bg-canvas/70"
      >
        <span
          className={`min-w-0 flex-1 truncate text-[13px] text-ink ${mono ? "font-mono tracking-[0.1em]" : ""}`}
        >
          {value}
        </span>
        <span className="shrink-0 text-[11px] font-semibold text-ink-subtle">
          {copied ? "copied" : <Copy size={13} />}
        </span>
      </button>
    </div>
  );
}

function ErrorRow({ err }: { err: LoggedError }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="overflow-hidden rounded-2xl border border-edge-soft/60 bg-elevated/40">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-3 px-4 py-3 text-start"
      >
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded bg-canvas/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink-subtle">
              {err.kind}
            </span>
            <span className="truncate text-[13.5px] font-semibold text-ink">{err.code}</span>
            <span className="ms-auto shrink-0 text-[11px] text-ink-subtle">
              {new Date(err.at).toLocaleTimeString()}
            </span>
          </div>
          <p className="mt-1 break-words text-[13px] text-ink-muted">{err.message}</p>
        </div>
      </button>
      {open && err.detail && (
        <pre className="max-h-64 overflow-auto border-t border-edge-soft/40 bg-canvas/50 px-4 py-3 text-[11px] leading-relaxed text-ink-subtle">
          {err.detail}
        </pre>
      )}
    </li>
  );
}

function fmtBytes(n: number): string {
  if (n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
