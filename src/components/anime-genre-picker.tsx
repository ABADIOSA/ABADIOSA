import { Check, ChevronDown, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "@/lib/i18n";
import { useSettings } from "@/lib/settings";
import { ORIGIN_OPTIONS } from "@/lib/anime-filter";
import { GENRE } from "@/lib/providers/jikan";
import { GENRE_ICON } from "./anime-genre-picker/genre-icons";

const OPTIONS: Array<{ id: number; label: string }> = [
  { id: GENRE.Action, label: "Action" },
  { id: GENRE.Adventure, label: "Adventure" },
  { id: GENRE.Comedy, label: "Comedy" },
  { id: GENRE.Drama, label: "Drama" },
  { id: GENRE.Fantasy, label: "Fantasy" },
  { id: GENRE.SciFi, label: "Sci-Fi" },
  { id: GENRE.Romance, label: "Romance" },
  { id: GENRE.SliceOfLife, label: "Slice of Life" },
  { id: GENRE.Supernatural, label: "Supernatural" },
  { id: GENRE.Mystery, label: "Mystery" },
  { id: GENRE.Psychological, label: "Psychological" },
  { id: GENRE.Horror, label: "Horror" },
  { id: GENRE.Thriller, label: "Thriller" },
  { id: GENRE.Mecha, label: "Mecha" },
  { id: GENRE.Sports, label: "Sports" },
  { id: GENRE.Music, label: "Music" },
];

export function AnimeGenrePicker({
  initial,
  onSave,
  onClose,
}: {
  initial: number[];
  onSave: (genres: number[]) => void;
  onClose: () => void;
}) {
  const t = useT();
  const { settings, update } = useSettings();
  const [selected, setSelected] = useState<Set<number>>(() => new Set(initial));
  const [origins, setOrigins] = useState<Set<string>>(() => new Set(settings.animeExcludeOrigins));
  const [hideWatched, setHideWatched] = useState(settings.animeHideWatchedPicks);
  const [filtersOpen, setFiltersOpen] = useState(
    settings.animeExcludeOrigins.length > 0 || settings.animeHideWatchedPicks,
  );

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const toggle = (id: number) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleOrigin = (code: string) => {
    setOrigins((cur) => {
      const next = new Set(cur);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const save = () => {
    onSave(Array.from(selected));
    update({ animeExcludeOrigins: Array.from(origins), animeHideWatchedPicks: hideWatched });
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center px-4 py-10">
      <button
        aria-label={t("Close")}
        onClick={onClose}
        className="animate-in fade-in absolute inset-0 -z-10 cursor-default bg-canvas/85 backdrop-blur-[3px] duration-200"
      />
      <div className="animate-in fade-in zoom-in-95 relative flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-[26px] border border-edge-soft/70 bg-elevated shadow-[0_40px_120px_-30px_rgba(0,0,0,0.85)] duration-200 ease-[cubic-bezier(0.32,0.72,0.24,1)]">
        <button
          type="button"
          aria-label={t("Close")}
          onClick={onClose}
          className="absolute end-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-canvas/60 hover:text-ink"
        >
          <X size={16} strokeWidth={2.2} />
        </button>

        <div className="flex flex-col gap-1.5 px-8 pt-8">
          <span className="text-[11px] font-bold uppercase tracking-[0.28em] text-ink-subtle">
            {t("Tune anime")}
          </span>
          <h2 className="font-display text-[27px] font-medium leading-tight tracking-tight text-ink">
            {t("Shape your anime feed.")}
          </h2>
          <p className="text-[13.5px] text-ink-muted">
            {t("Steer your Top Picks and hero toward what you love, and hide what you don't.")}
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-8 py-7">
          <div className="flex flex-col gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-ink-subtle">
              {t("Genres you want more of")}
            </span>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {OPTIONS.map((opt) => {
                const on = selected.has(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggle(opt.id)}
                    aria-pressed={on}
                    className={`group flex items-center gap-3 rounded-2xl px-3 py-2.5 text-start transition-[background-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0.24,1)] active:scale-[0.97] motion-reduce:active:scale-100 ${
                      on
                        ? "bg-accent/[0.12] ring-2 ring-accent"
                        : "bg-canvas/50 ring-1 ring-edge-soft hover:bg-canvas/70 hover:ring-edge"
                    }`}
                  >
                    <span
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-[background-color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0.24,1)] group-hover:scale-[1.06] group-active:scale-95 motion-reduce:transform-none ${
                        on ? "bg-accent/20" : "bg-elevated/70"
                      }`}
                    >
                      <img src={GENRE_ICON[opt.id]} alt="" draggable={false} className="h-[26px] w-[26px]" />
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-[14px] font-semibold transition-colors ${
                        on ? "text-ink" : "text-ink-muted"
                      }`}
                    >
                      {opt.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="border-t border-edge-soft/45 pt-4">
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className="group flex w-full items-center justify-between rounded-xl px-1 py-1.5 text-start"
            >
              <span className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-[0.2em] text-ink-subtle transition-colors group-hover:text-ink-muted">
                {t("Hide from your picks")}
                {origins.size + (hideWatched ? 1 : 0) > 0 && (
                  <span className="rounded-full bg-danger/15 px-2 py-[2px] text-[10px] font-bold tracking-normal text-danger">
                    {origins.size + (hideWatched ? 1 : 0)}
                  </span>
                )}
              </span>
              <ChevronDown
                size={18}
                strokeWidth={2.2}
                className={`shrink-0 text-ink-subtle transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0.24,1)] ${
                  filtersOpen ? "rotate-180 text-ink-muted" : ""
                }`}
              />
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.32,0.72,0.24,1)] ${
                filtersOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <div className="flex flex-col gap-3 pt-4">
                  <div className="flex flex-wrap gap-2.5">
                    {ORIGIN_OPTIONS.map((opt) => {
                      const on = origins.has(opt.code);
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          onClick={() => toggleOrigin(opt.code)}
                          className={`h-11 rounded-full px-5 text-[14px] font-semibold transition-[background-color,color,box-shadow,transform] duration-150 active:scale-[0.97] ${
                            on
                              ? "bg-danger text-white shadow-[0_6px_18px_-8px_rgba(0,0,0,0.55)]"
                              : "bg-canvas/50 text-ink-muted ring-1 ring-edge-soft hover:text-ink hover:ring-edge"
                          }`}
                        >
                          {t(opt.label)}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setHideWatched((v) => !v)}
                    className="mt-1 flex items-center gap-3 self-start rounded-xl py-1 text-start"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                        hideWatched ? "border-accent bg-accent text-canvas" : "border-edge text-transparent"
                      }`}
                    >
                      <Check size={13} strokeWidth={3} />
                    </span>
                    <span className="text-[14px] font-medium text-ink">
                      {t("Hide anime I've already watched")}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-edge-soft/45 px-8 py-5">
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className={`text-[12.5px] font-medium transition-colors ${
              selected.size > 0 ? "text-ink-subtle hover:text-ink" : "pointer-events-none text-transparent"
            }`}
          >
            {t("Clear all")}
          </button>
          <div className="flex items-center gap-4">
            <span className="text-[12.5px] tabular-nums text-ink-subtle">
              {selected.size > 0 ? t("{count} selected", { count: selected.size }) : t("None yet")}
            </span>
            <button
              type="button"
              onClick={save}
              className="h-11 rounded-full bg-ink px-7 text-[14px] font-semibold text-canvas transition-transform hover:scale-[1.02] active:scale-[0.98]"
            >
              {t("Done")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
