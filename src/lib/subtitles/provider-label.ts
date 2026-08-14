import type { SubResult } from "./types";

export function providerLabel(r: Pick<SubResult, "source" | "title">): string {
  switch (r.source) {
    case "opensubtitles":
      return "OpenSubtitles";
    case "wyzie":
      return "Wyzie";
    case "subdl":
      return "SubDL";
    case "subsource":
      return "SubSource";
    case "podnapisi":
      return "Podnapisi";
    case "gestdown":
      return "Gestdown";
    case "jimaku":
      return "Jimaku";
    case "addon":
      return r.title || "Addon";
    default:
      return r.source;
  }
}

export function releaseOf(r: Pick<SubResult, "source" | "title" | "release">): string | undefined {
  const rel = r.release?.trim();
  if (rel) return rel;
  if (r.source === "addon") return undefined;
  const title = r.title?.trim();
  return title || undefined;
}
