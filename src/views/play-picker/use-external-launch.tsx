import { ExternalLink, Loader2, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import type { DebridStore } from "@/lib/debrid/types";
import { useT } from "@/lib/i18n";
import {
  APP_STORE_LINKS,
  EXTERNAL_APPS,
  buildExternalLink,
  openExternal,
} from "@/lib/player/external-player";
import { useSettings } from "@/lib/settings";
import { resolveStream } from "@/lib/streams/resolve";
import type { ScoredStream } from "@/lib/streams/types";
import { gatherSubtitleAddons } from "@/lib/subtitles/addon-source";
import { subtitleSearchImdbId } from "@/lib/subtitles/autoload";
import { langScore } from "@/lib/subtitles/language";
import { searchSubtitles } from "@/lib/subtitles/search";
import type { SubResult } from "@/lib/subtitles/types";
import type { PlayEpisode } from "@/lib/view";

function resolveLangPreference(primary?: string[], fallback?: string[]): string[] {
  if (primary && primary.length > 0) return primary;
  if (fallback && fallback.length > 0) return fallback;
  return ["English"];
}

type Sheet = {
  title: string;
  videoUrl: string;
  subs: SubResult[];
  subIdx: number;
};

export function useExternalLaunch(ctx: {
  meta: Meta;
  episode?: PlayEpisode;
  imdbId: string | null;
  imdbVerified: boolean;
  debrids: DebridStore[];
  authKey: string | null;
}) {
  const { meta, episode, imdbId, imdbVerified, debrids, authKey } = ctx;
  const { settings } = useSettings();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const acRef = useRef<AbortController | null>(null);

  const launch = useCallback(
    async (stream: ScoredStream, displayTitle: string) => {
      acRef.current?.abort();
      const ac = new AbortController();
      acRef.current = ac;
      setError(null);
      setBusy(true);
      try {
        const hint = { season: episode?.season ?? null, episode: episode?.episode ?? null };
        const r = await resolveStream(stream, debrids, ac.signal, true, false, hint);
        if (ac.signal.aborted) return;
        if (!r.ok || !r.data.url || !/^https?:\/\//i.test(r.data.url)) {
          setError(
            t(
              "This source has no direct link to hand off. Pick a source from a debrid account (TorBox, Real-Debrid).",
            ),
          );
          return;
        }
        const videoUrl = r.data.url;
        const langs = resolveLangPreference(
          settings.preferredSubLangs,
          settings.preferredLanguages,
        );
        let subs: SubResult[] = [];
        try {
          const subAddons = await gatherSubtitleAddons(authKey).catch(() => []);
          const searchImdbId = subtitleSearchImdbId(imdbId, imdbVerified);
          const found = await searchSubtitles(
            {
              imdbId: searchImdbId,
              stremioId: meta.id,
              type: meta.type === "series" ? "series" : "movie",
              season: episode?.season,
              episode: episode?.episode,
              langs,
              filename: stream.parsedTitle ?? stream.title ?? undefined,
            },
            {
              providers: { wyzie: true, addons: true, opensubtitles: true },
              addons: subAddons,
              preferredLangs: langs,
            },
          );
          subs = found
            .filter((s) => /^https?:\/\//i.test(s.url))
            .sort((a, b) => langScore(b.lang, langs) - langScore(a.lang, langs))
            .slice(0, 20);
        } catch {
          subs = [];
        }
        if (ac.signal.aborted) return;
        setSheet({ title: displayTitle, videoUrl, subs, subIdx: subs.length > 0 ? 0 : -1 });
      } finally {
        if (!ac.signal.aborted) setBusy(false);
      }
    },
    [meta, episode, imdbId, imdbVerified, debrids, authKey, settings, t],
  );

  const cancel = useCallback(() => {
    acRef.current?.abort();
    setBusy(false);
    setError(null);
    setSheet(null);
  }, []);

  const node = (
    <>
      {(busy || error) && <ExternalBusyModal busy={busy} error={error} onClose={cancel} t={t} />}
      {sheet && (
        <ExternalSheet sheet={sheet} setSheet={setSheet} onClose={() => setSheet(null)} t={t} />
      )}
    </>
  );

  return { launch, node, busy };
}

function ExternalBusyModal({
  busy,
  error,
  onClose,
  t,
}: {
  busy: boolean;
  error: string | null;
  onClose: () => void;
  t: (k: string) => string;
}) {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-elevated p-6 ring-1 ring-edge-soft" dir="auto">
        {busy ? (
          <div className="flex items-center gap-3 text-ink">
            <Loader2 size={20} className="animate-spin text-accent" />
            <span className="text-[14px]">{t("Preparing the stream and subtitles…")}</span>
          </div>
        ) : (
          <>
            <p className="text-[14px] leading-relaxed text-ink" dir="auto">
              {error}
            </p>
            <button
              onClick={onClose}
              className="mt-4 flex h-10 w-full items-center justify-center rounded-full bg-ink text-[13.5px] font-semibold text-canvas"
            >
              {t("Back")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ExternalSheet({
  sheet,
  setSheet,
  onClose,
  t,
}: {
  sheet: Sheet;
  setSheet: (s: Sheet) => void;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const activeSub = sheet.subIdx >= 0 ? sheet.subs[sheet.subIdx] : null;
  return (
    <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/70 sm:items-center">
      <div
        className="w-full max-w-md rounded-t-3xl bg-elevated p-5 ring-1 ring-edge-soft sm:rounded-3xl"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        dir="auto"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-ink">
              {t("Open in an external player")}
            </h2>
            <p className="mt-0.5 truncate text-[12.5px] text-ink-muted">{sheet.title}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-subtle hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-edge-soft bg-canvas/40 px-3.5 py-2.5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
            {t("Subtitle")}
          </p>
          {sheet.subs.length === 0 ? (
            <p className="text-[12.5px] text-ink-muted">{t("No subtitle found — video only.")}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <SubChip
                active={sheet.subIdx === -1}
                onClick={() => setSheet({ ...sheet, subIdx: -1 })}
                label={t("None")}
              />
              {sheet.subs.slice(0, 8).map((s, i) => (
                <SubChip
                  key={s.id}
                  active={sheet.subIdx === i}
                  onClick={() => setSheet({ ...sheet, subIdx: i })}
                  label={(s.langName || s.lang || "?").toUpperCase()}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {EXTERNAL_APPS.map((app) => {
            const subUrl = app.carriesSubtitle && activeSub ? activeSub.url : null;
            const link = buildExternalLink(app.app, sheet.videoUrl, subUrl);
            return (
              <div key={app.app} className="flex items-center gap-2">
                <button
                  onClick={() => openExternal(link)}
                  className="flex h-12 flex-1 items-center justify-between rounded-xl bg-ink px-4 text-[14px] font-semibold text-canvas transition-opacity hover:opacity-90"
                >
                  <span>{app.label}</span>
                  <span className="flex items-center gap-1.5 text-[11.5px] font-medium text-canvas/70">
                    {app.carriesSubtitle && activeSub ? t("+ subtitle") : ""}
                    <ExternalLink size={14} />
                  </span>
                </button>
                <a
                  href={APP_STORE_LINKS[app.app]}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-12 items-center rounded-xl border border-edge-soft px-3 text-[11px] font-medium text-ink-subtle transition-colors hover:text-ink"
                >
                  {t("Get")}
                </a>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-subtle" dir="auto">
          {t(
            "Infuse and VLC also load the subtitle. If nothing opens, install the app with Get, then try again.",
          )}
        </p>
      </div>
    </div>
  );
}

function SubChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-7 rounded-full px-2.5 text-[11.5px] font-semibold transition-colors ${
        active ? "bg-accent text-white" : "bg-elevated/70 text-ink-muted ring-1 ring-edge-soft"
      }`}
    >
      {label}
    </button>
  );
}
