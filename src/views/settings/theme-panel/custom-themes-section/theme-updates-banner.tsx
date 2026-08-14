import { ArrowUpCircle, Loader2, RefreshCw } from "lucide-react";
import { useThemeUpdates } from "./use-theme-updates";

export function ThemeUpdatesBanner() {
  const { updates, busy, updateOne } = useThemeUpdates();
  if (updates.length === 0) return null;
  return (
    <section className="animate-in fade-in slide-in-from-top-1 flex flex-col gap-3 rounded-[6px] border border-accent/30 bg-accent/[0.06] p-4 motion-reduce:animate-none">
      <div className="flex items-center gap-2.5">
        <ArrowUpCircle size={18} className="text-accent" />
        <span className="text-[14px] font-semibold text-ink">
          {updates.length} theme update{updates.length > 1 ? "s" : ""} available
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {updates.map((u) => (
          <div key={u.storeId} className="flex items-center gap-3 rounded-[4px] border border-edge-soft bg-surface px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{u.name}</span>
            <button
              type="button"
              onClick={() => updateOne(u)}
              disabled={busy === u.storeId}
              className="flex h-8 items-center gap-1.5 rounded-[4px] bg-ink px-3 text-[12px] font-semibold text-canvas transition-[opacity,transform] hover:opacity-90 active:scale-[0.97] disabled:opacity-50 motion-reduce:active:scale-100"
            >
              {busy === u.storeId ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} strokeWidth={2.4} />}
              Update
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
