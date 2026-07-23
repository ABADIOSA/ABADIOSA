import { AlertTriangle, Copy, KeyRound, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { APP_VERSION, CHANNEL } from "@/lib/build-info";
import { clearErrors, readErrors, type LoggedError } from "@/lib/admin/error-log";
import { reportingEnabled } from "@/lib/admin/report";
import { sha256Hex } from "@/lib/access/gate";

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

          <AccessCodeTool />

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

// Generates a personal access code for someone you share the production app
// with. It shows the code to hand to the person and the exact JSON line to paste
// into public/access.json (then deploy) — the raw code is never stored, only its
// hash, and deleting the line later revokes that person.
function AccessCodeTool() {
  const [name, setName] = useState("");
  const [result, setResult] = useState<{ code: string; entry: string } | null>(null);

  const generate = async () => {
    const person = name.trim() || "Guest";
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    const raw = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    const hash = await sha256Hex(code);
    const entry = `{ "name": ${JSON.stringify(person)}, "hash": "${hash}" }`;
    setResult({ code, entry });
  };

  return (
    <section>
      <h2 className="mb-2.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-ink-subtle">
        <KeyRound size={13} />
        Access codes
      </h2>
      <div className="rounded-2xl border border-edge-soft/60 bg-elevated/40 p-4">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Person's name"
            className="h-10 flex-1 rounded-xl border border-edge-soft bg-canvas/60 px-3.5 text-[14px] text-ink outline-none focus:border-accent/60"
          />
          <button
            onClick={() => void generate()}
            className="h-10 shrink-0 rounded-xl bg-ink px-4 text-[13.5px] font-semibold text-canvas"
          >
            Generate
          </button>
        </div>
        {result && (
          <div className="mt-3 flex flex-col gap-2">
            <CopyField label="Code (give to the person)" value={result.code} mono />
            <CopyField label="Add this line to public/access.json → codes[]" value={result.entry} />
            <p className="text-[11.5px] leading-relaxed text-ink-subtle">
              Paste the line into <code>public/access.json</code> and deploy. Remove it later to
              revoke access.
            </p>
          </div>
        )}
      </div>
    </section>
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
