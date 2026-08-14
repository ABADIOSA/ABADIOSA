import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";
import {
  closeVoyage,
  launchVoyage,
  markPlayed,
  metaById,
  nextUnplayedId,
  voyageReady,
} from "@/lib/voyage/store";
import type { Voyage } from "@/lib/voyage/types";
import { RouteRail } from "./route-rail";
import { CompletePanel, ExhaustedPanel } from "./voyage-panels";
import { VoyagePicker } from "./voyage-picker";
import { VoyageReady } from "./voyage-ready";
import { VoyageSailing } from "./voyage-sailing";

export function VoyageRoute({ voyage }: { voyage: Voyage }) {
  const t = useT();
  const { openMeta, openPicker } = useView();
  const sailing = voyage.phase === "sailing";
  const nextId = sailing ? nextUnplayedId(voyage) : undefined;
  const next = nextId ? metaById(voyage, nextId) : undefined;
  const ready = voyageReady(voyage);
  const stuck = !sailing && !ready && voyage.headingIds.length === 0;

  const play = (meta: Meta) => {
    markPlayed(meta.id);
    closeVoyage();
    if (meta.type === "movie") openPicker(meta, undefined, { autoPlay: true, resume: true });
    else openMeta(meta);
  };

  const start = () => {
    const first = metaById(voyage, voyage.routeIds[0]);
    launchVoyage();
    if (first) play(first);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <span
          className="text-[11px] font-semibold uppercase tracking-[0.2em]"
          style={{ color: voyage.accent }}
        >
          {sailing ? t("On a voyage") : t("Building your voyage")}
        </span>
        <h2 className="font-display text-[24px] font-medium tracking-tight text-ink">
          {voyage.themeLabel}
        </h2>
      </div>

      <RouteRail voyage={voyage} onPlay={sailing ? play : undefined} />

      {sailing ? (
        next ? (
          <VoyageSailing voyage={voyage} next={next} onPlay={play} />
        ) : (
          <CompletePanel total={voyage.routeIds.length} />
        )
      ) : ready ? (
        <VoyageReady voyage={voyage} onStart={start} />
      ) : stuck ? (
        <ExhaustedPanel picked={voyage.routeIds.length} onStart={start} />
      ) : (
        <VoyagePicker voyage={voyage} />
      )}
    </div>
  );
}
