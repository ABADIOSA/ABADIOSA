import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Play, Star } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import type { TmdbDetail } from "@/lib/providers/tmdb";
import { useT } from "@/lib/i18n";

const YT_THUMB = (id: string) => `https://img.youtube.com/vi/${id}/mqdefault.jpg`;

type Video = { ytId: string; name: string };

function collectVideos(details: TmdbDetail | null, title: string): Video[] {
  const seen = new Set<string>();
  const out: Video[] = [];
  const push = (ytId: string | null | undefined, name: string) => {
    if (!ytId || seen.has(ytId)) return;
    seen.add(ytId);
    out.push({ ytId, name });
  };
  push(details?.trailerYtId, `${title} trailer`);
  for (const v of details?.extraVideos ?? []) push(v.ytId, v.name || v.type || title);
  return out;
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[12.5px] font-semibold text-white/85">
      {children}
    </span>
  );
}

export function XrayAbout({
  meta,
  details,
  onPlayVideo,
}: {
  meta: Meta;
  details: TmdbDetail | null;
  onPlayVideo?: (ytId: string, name: string) => void;
}) {
  const title = details?.title || meta.name;
  const logo = details?.logo || meta.logo;
  const tagline = details?.tagline;
  const overview = details?.overview || meta.description || "";
  const genres = (details?.genres?.length ? details.genres : meta.genres) ?? [];
  const year = details?.year || meta.releaseInfo;
  const runtime = details?.runtime || meta.runtime;
  const rating = details?.rating || meta.imdbRating;

  const backdrops = useMemo(() => {
    const list = details?.gallery.backdrops ?? [];
    const base = details?.backdrop || meta.background;
    const merged = base ? [base, ...list.filter((b) => b !== base)] : list;
    return [...new Set(merged)];
  }, [details, meta.background]);
  const videos = useMemo(() => collectVideos(details, title), [details, title]);

  const [hero, setHero] = useState(backdrops[0]);
  const shown = hero ?? backdrops[0];

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5">
      <div className="relative overflow-hidden rounded-[20px] bg-white/[0.03] ring-1 ring-white/10">
        {shown ? (
          <img key={shown} src={shown} alt="" className="aspect-[16/7] w-full object-cover animate-in fade-in duration-300 motion-reduce:animate-none" />
        ) : (
          <div className="aspect-[16/7] w-full" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        {logo ? (
          <img src={logo} alt={title} className="absolute bottom-5 left-6 max-h-[62px] max-w-[46%] object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.65)]" />
        ) : (
          <h2 className="absolute bottom-5 left-6 max-w-[70%] font-display text-[28px] font-bold leading-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.7)]">
            {title}
          </h2>
        )}
      </div>

      {(videos.length > 0 || backdrops.length > 1) && (
        <div className="flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:thin]">
          {videos.map((v) => (
            <Thumb key={v.ytId} src={YT_THUMB(v.ytId)} label={v.name} play onClick={() => onPlayVideo?.(v.ytId, v.name)} />
          ))}
          {backdrops.map((b) => (
            <Thumb key={b} src={b} active={b === shown} onClick={() => setHero(b)} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {year && <Chip>{year}</Chip>}
        {runtime && <Chip>{runtime}</Chip>}
        {rating && (
          <Chip>
            <Star size={12} strokeWidth={2.4} className="text-amber-300" fill="currentColor" />
            {rating}
          </Chip>
        )}
      </div>

      {tagline && <p className="text-[15px] italic text-white/55">{tagline}</p>}
      {overview && <p className="max-w-[48rem] text-[14.5px] leading-relaxed text-white/80">{overview}</p>}

      {genres.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {genres.map((g) => (
            <span key={g} className="rounded-full border border-white/15 px-3 py-1 text-[12px] font-medium text-white/60">
              {g}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Thumb({
  src,
  label,
  active,
  play,
  onClick,
}: {
  src: string;
  label?: string;
  active?: boolean;
  play?: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={play ? `${t("Play")} ${label ?? ""}` : t("Show image")}
      className={`group relative aspect-video w-[132px] shrink-0 overflow-hidden rounded-[11px] ring-1 transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-0.5 motion-reduce:hover:translate-y-0 ${
        active ? "ring-2 ring-accent" : "ring-white/12 hover:ring-white/35"
      }`}
    >
      <img src={src} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
      {play && (
        <span className="absolute inset-0 grid place-items-center bg-black/25 transition-colors group-hover:bg-black/40">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-white/90 text-black shadow-lg">
            <Play size={14} strokeWidth={2.6} className="ms-0.5" fill="currentColor" />
          </span>
        </span>
      )}
      {play && label && (
        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 to-transparent px-2 pb-1 pt-4 text-start text-[10.5px] font-medium text-white/85">
          {label}
        </span>
      )}
    </button>
  );
}
