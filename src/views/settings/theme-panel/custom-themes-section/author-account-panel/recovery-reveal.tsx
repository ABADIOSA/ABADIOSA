import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy } from "lucide-react";

export function RecoveryReveal({ code, onDone }: { code: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[240] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-canvas/75 backdrop-blur-sm" />
      <div className="modal-panel harbor-step relative flex w-full max-w-md flex-col gap-5 rounded-3xl border border-edge-soft bg-elevated p-7 shadow-[0_30px_90px_-30px_rgba(0,0,0,0.8)]">
        <div className="flex flex-col gap-1.5">
          <h2 className="font-display text-[24px] font-medium leading-tight text-ink">Save your recovery code</h2>
          <p className="text-[13.5px] leading-relaxed text-ink-muted">
            This is the only time you'll see it. If you ever forget your password, this code is the only way back into your
            account. Store it somewhere safe.
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-2xl border border-edge-soft bg-canvas/50 p-4">
          <span className="select-all break-all text-center font-mono text-[19px] font-semibold tracking-[0.14em] text-ink">
            {code}
          </span>
          <button
            onClick={copy}
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-ink text-[12.5px] font-semibold text-canvas transition-opacity hover:opacity-90"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy code"}
          </button>
        </div>

        <button
          onClick={() => setSaved((s) => !s)}
          className="flex items-center gap-2.5 text-start text-[13px] text-ink-muted"
        >
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
              saved ? "border-accent bg-accent text-canvas" : "border-edge"
            }`}
          >
            {saved && <Check size={13} strokeWidth={3} />}
          </span>
          I've saved my recovery code somewhere safe.
        </button>

        <button
          onClick={onDone}
          disabled={!saved}
          className="h-11 rounded-xl bg-accent text-[14px] font-semibold text-canvas transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Continue
        </button>
      </div>
    </div>,
    document.body,
  );
}
