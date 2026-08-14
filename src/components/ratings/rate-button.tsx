import { useState } from "react";
import { Star } from "lucide-react";
import { HoverTooltip } from "@/components/hover-tooltip";
import { useT } from "@/lib/i18n";
import { useRating } from "@/lib/ratings/store";
import type { RatingTarget } from "@/lib/ratings/types";
import { RatingModal } from "./rating-modal";

export function RateButton({ target }: { target: RatingTarget }) {
  const t = useT();
  const existing = useRating(target.itemKey);
  const [open, setOpen] = useState(false);
  const score = existing?.score ?? 0;

  return (
    <>
      <HoverTooltip
        label={score ? t("Your rating {n}/10", { n: score }) : t("Rate this")}
        align="center"
        className="shrink-0"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={score ? t("Your rating {n}/10", { n: score }) : t("Rate this")}
          className={`group flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-[transform,background-color,border-color] duration-200 active:scale-[0.94] ${
            score
              ? "border-ink/30 bg-ink/10 text-ink hover:bg-ink/15"
              : "border-edge bg-canvas/80 text-ink hover:border-ink-subtle hover:bg-canvas/95"
          }`}
        >
          {score ? (
            <span className="text-[16px] font-bold leading-none tabular-nums">{score}</span>
          ) : (
            <Star size={20} strokeWidth={1.9} />
          )}
        </button>
      </HoverTooltip>
      {open && <RatingModal target={target} onClose={() => setOpen(false)} />}
    </>
  );
}
