import { useT } from "@/lib/i18n";
import type { SportsMatchDetail } from "@/lib/sports/espn";

function SetTable({ detail }: { detail: SportsMatchDetail }) {
  const t = useT();
  const sets = detail.allStats;
  if (sets.length === 0) return null;
  return (
    <div className="rounded-2xl border border-edge-soft/50 bg-elevated/20 p-4">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-subtle">
        {t("Set by set")}
      </div>
      <div className="flex flex-col gap-1">
        {sets.map((s, i) => {
          const h = Number(s.homeValue);
          const a = Number(s.awayValue);
          const hWin = Number.isFinite(h) && Number.isFinite(a) && h > a;
          const aWin = Number.isFinite(h) && Number.isFinite(a) && a > h;
          return (
            <div
              key={i}
              className="flex items-center justify-between border-b border-edge-soft/40 py-2 text-sm last:border-0"
            >
              <span className={`w-12 font-bold tabular-nums ${hWin ? "text-ink" : "text-ink-muted"}`}>
                {s.homeValue}
              </span>
              <span className="text-[12px] uppercase tracking-wider text-ink-subtle">{s.label}</span>
              <span className={`w-12 text-end font-bold tabular-nums ${aWin ? "text-ink" : "text-ink-muted"}`}>
                {s.awayValue}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TennisMatchPanel({ detail }: { detail: SportsMatchDetail }) {
  const t = useT();
  const c = detail.context;
  const facts: Array<[string, string]> = [];
  if (c?.name) facts.push([t("Tournament"), c.name]);
  if (c?.draw) facts.push([t("Draw"), c.draw]);
  if (c?.round) facts.push([t("Round"), c.round]);
  if (c?.court) facts.push([t("Court"), c.court]);
  if (c?.bestOf) facts.push([t("Format"), `${t("Best of")} ${c.bestOf}`]);
  if (c?.venue) facts.push([t("Venue"), c.venue]);
  if (detail.startMs) {
    facts.push([t("Start"), new Date(detail.startMs).toLocaleString()]);
  }

  return (
    <div className="flex flex-col gap-4">
      <SetTable detail={detail} />
      {facts.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {facts.map(([label, value]) => (
            <div
              key={label}
              className="flex flex-col gap-1 rounded-xl border border-edge-soft/40 bg-elevated/30 p-3.5"
            >
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-subtle">
                {label}
              </span>
              <span className="text-[13.5px] font-medium leading-snug text-ink">{value}</span>
            </div>
          ))}
        </div>
      )}
      {detail.allStats.length === 0 && (
        <p className="text-center text-[13px] text-ink-subtle">
          {detail.state === "pre"
            ? t("This match has not started yet.")
            : t("Scores will appear here once play begins.")}
        </p>
      )}
    </div>
  );
}
