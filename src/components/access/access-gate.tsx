import { Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { evaluateAccess, tryCode } from "@/lib/access/gate";

// Full-screen blocker for the production app. It clears itself once the person's
// code is verified (or was verified before), and never appears on the admin
// build. It is an access convenience for the people you share the app with — not
// a secrets boundary — so an opaque cover that gates interaction is enough.
export function AccessGate() {
  const [status, setStatus] = useState<"checking" | "locked" | "open">("checking");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    const forceGate =
      typeof window !== "undefined" && new URLSearchParams(window.location.search).has("gate");
    evaluateAccess(forceGate).then((r) => {
      if (!alive) return;
      if (r.name) rememberName(r.name);
      setStatus(r.open ? "open" : "locked");
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (status === "locked") setTimeout(() => inputRef.current?.focus(), 60);
  }, [status]);

  if (status === "open") return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError(false);
    const r = await tryCode(code);
    setBusy(false);
    if (r.ok) {
      if (r.name) rememberName(r.name);
      setStatus("open");
    } else {
      setError(true);
      setCode("");
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[400] flex flex-col items-center justify-center bg-canvas px-7"
      dir="auto"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {status === "checking" ? (
        <Loader2 size={26} className="animate-spin text-ink-subtle" />
      ) : (
        <form onSubmit={submit} className="flex w-full max-w-sm flex-col items-center">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/12 text-accent ring-1 ring-accent/25">
            <LockKeyhole size={28} strokeWidth={1.8} />
          </div>
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">ABADIOSA</h1>
          <p className="mt-1.5 text-center text-[14px] text-ink-muted">
            أدخل رمز الدخول الخاص بك للمتابعة
          </p>
          <input
            ref={inputRef}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError(false);
            }}
            placeholder="رمز الدخول"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            className={`mt-7 h-14 w-full rounded-2xl border bg-elevated/60 px-5 text-center text-[18px] font-semibold tracking-[0.12em] text-ink outline-none transition-colors placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-subtle ${
              error ? "border-danger/60" : "border-edge-soft focus:border-accent/60"
            }`}
          />
          {error && (
            <p className="mt-2.5 text-[13px] font-medium text-danger">
              رمز غير صحيح — تأكد منه أو اطلب رمزًا جديدًا.
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !code.trim()}
            className="mt-5 flex h-13 w-full items-center justify-center gap-2 rounded-2xl bg-ink py-3.5 text-[15px] font-semibold text-canvas transition-opacity disabled:opacity-50"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : "دخول"}
          </button>
        </form>
      )}
    </div>
  );
}

function rememberName(name: string): void {
  try {
    if (!localStorage.getItem("harbor.together.name")) {
      localStorage.setItem("harbor.together.name", name);
    }
  } catch {
    /* ignore */
  }
}
