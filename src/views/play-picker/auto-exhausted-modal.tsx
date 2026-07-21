import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { useView, type PlayEpisode } from "@/lib/view";
import { openUrl } from "@/lib/window";

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function AutoExhaustedModal({
  meta,
  episode,
  triedCount,
  onBrowseManually,
}: {
  meta: Meta;
  episode?: PlayEpisode;
  triedCount: number;
  onBrowseManually: () => void;
}) {
  const { goBack } = useView();
  const t = useT();
  const title = meta.name ?? "this title";
  const epSuffix = episode
    ? ` S${episode.imdbSeason ?? episode.season}E${String(episode.imdbEpisode ?? episode.episode).padStart(2, "0")}`
    : "";
  const subject = `Harbor: no working stream for ${title}${epSuffix}`;
  const body =
    `Title: ${title}${epSuffix}\n` +
    `IMDb: ${meta.id ?? ""}\n` +
    `Streams tried: ${triedCount}\n` +
    `\nWhat happened: Harbor could not find a working stream automatically.\n` +
    `\n(Add any extra detail here)`;
  const mailto = `mailto:bugs@harbor.site?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <main
      data-tv-focus-scope
      className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden bg-black px-6"
    >
      <div className="w-full max-w-md rounded-2xl bg-elevated p-8 ring-1 ring-edge-soft">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-ink-subtle">
          ABADIOSA
        </p>
        <h2 className="mt-3 text-start text-[24px] font-semibold leading-tight text-ink" dir="auto">
          {t("We could not find a working stream")}
        </h2>
        <p className="mt-3 text-start text-[14px] leading-relaxed text-ink-muted" dir="auto">
          {t(
            "Harbor checked every available source for {title} and none of them played. The most common reasons:",
            { title: `${title}${epSuffix}` },
          )}
        </p>
        <ul
          className="mt-3 space-y-1.5 text-start text-[13.5px] leading-relaxed text-ink-muted"
          dir="auto"
        >
          {!IS_TAURI && (
            <li dir="auto">
              {t(
                "· On iPhone/Safari, many sources use formats the browser can't play (MKV, HEVC). Try a different source below — pick one marked MP4/H.264 — or use the desktop app, which plays every format.",
              )}
            </li>
          )}
          <li dir="auto">
            {t("· A debrid key (TorBox, Real-Debrid, etc.) is missing or expired.")}
          </li>
          <li dir="auto">
            {t("· No stream addon is installed yet (Torrentio, MediaFusion, Comet).")}
          </li>
          <li dir="auto">{t("· This title is too new and no source has it cached yet.")}</li>
        </ul>
        <div className="mt-7 flex flex-col gap-2.5">
          <button
            onClick={onBrowseManually}
            className="flex h-11 items-center justify-center rounded-full bg-ink text-[14px] font-semibold text-canvas transition-opacity hover:opacity-90"
          >
            {t("Browse streams manually")}
          </button>
          <button
            onClick={() => openUrl(mailto)}
            className="flex h-11 items-center justify-center rounded-full bg-elevated text-[13.5px] font-medium text-ink ring-1 ring-edge-soft transition-colors hover:bg-raised"
          >
            {t("Send a bug report")}
          </button>
          <button
            onClick={goBack}
            data-tv-modal-close
            className="mt-1 text-[12.5px] text-ink-subtle transition-colors hover:text-ink-muted"
          >
            {t("Back")}
          </button>
        </div>
      </div>
    </main>
  );
}
