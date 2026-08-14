const TMDB_TIERS = [92, 154, 185, 300, 342, 500, 780, 1280];

function tmdbSegment(targetPx: number): string {
  for (const t of TMDB_TIERS) if (t >= targetPx) return `w${t}`;
  return "original";
}

export function sizeImageUrl(url: string, targetPx: number): string {
  if (!url || targetPx <= 0) return url;
  const seg = tmdbSegment(targetPx);
  return url.replace(/(\/t\/p\/)(w\d+|original)(\/)/, `$1${seg}$3`);
}

export type PosterQuality = "balanced" | "high" | "max";

export function qualityMultiplier(q: PosterQuality): number {
  if (q === "max") return 0;
  return q === "high" ? 1.5 : 1;
}
