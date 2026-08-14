import { AdSkipIcon } from "@/components/icons/adskip-icon";
import { useT } from "@/lib/i18n";

export function AdSkipShowcase() {
  const t = useT();
  return (
    <div className="overflow-hidden rounded-2xl border border-edge-soft bg-black/50 shadow-[0_10px_34px_-14px_rgba(0,0,0,0.7)]">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-gradient-to-br from-zinc-900 via-zinc-950 to-black">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex items-center gap-3 rounded-xl border border-white/15 bg-black/55 px-4 py-3 shadow-2xl">
          <AdSkipIcon className="h-7 w-7 text-accent" />
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
              {t("Ad detected")}
            </span>
            <span className="text-sm font-semibold text-white">{t("Skip ad")}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-edge-soft/60 px-4 py-2.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
        <span className="text-[11.5px] text-ink-muted">
          {t("When a flagged ad plays, a Skip button slides in so you jump straight past it.")}
        </span>
      </div>
    </div>
  );
}
