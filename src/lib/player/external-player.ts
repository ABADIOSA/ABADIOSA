// External-player hand-off for the web build. iOS Safari can't decode MKV/HEVC,
// but native player apps (Infuse, VLC, Outplayer, nPlayer) can. We hand them the
// resolved video URL together with the best subtitle URL from the subtitle
// addons, so the user gets the film AND subtitles in an app that plays every
// format. These apps fetch the URLs themselves, so browser CORS does not apply.

export type ExternalApp = "infuse" | "vlc" | "outplayer" | "nplayer";

export type ExternalTarget = {
  app: ExternalApp;
  label: string;
  /** Whether this app's deep link carries the external subtitle URL. */
  carriesSubtitle: boolean;
};

export const EXTERNAL_APPS: ExternalTarget[] = [
  { app: "infuse", label: "Infuse", carriesSubtitle: true },
  { app: "vlc", label: "VLC", carriesSubtitle: true },
  { app: "outplayer", label: "Outplayer", carriesSubtitle: false },
  { app: "nplayer", label: "nPlayer", carriesSubtitle: false },
];

// App Store fallbacks so a user without the app can install it.
export const APP_STORE_LINKS: Record<ExternalApp, string> = {
  infuse: "https://apps.apple.com/app/infuse-7/id1136220934",
  vlc: "https://apps.apple.com/app/vlc-media-player/id650377962",
  outplayer: "https://apps.apple.com/app/outplayer/id1440242106",
  nplayer: "https://apps.apple.com/app/nplayer/id1116905928",
};

function enc(u: string): string {
  return encodeURIComponent(u);
}

export function buildExternalLink(
  app: ExternalApp,
  videoUrl: string,
  subtitleUrl?: string | null,
): string {
  const v = enc(videoUrl);
  const sub = subtitleUrl ? enc(subtitleUrl) : "";
  switch (app) {
    case "infuse":
      // Infuse x-callback: url + optional sub for an external subtitle track.
      return sub
        ? `infuse://x-callback-url/play?url=${v}&sub=${sub}`
        : `infuse://x-callback-url/play?url=${v}`;
    case "vlc":
      // VLC for iOS x-callback stream endpoint; sub is an external subtitle URL.
      return sub
        ? `vlc-x-callback://x-callback-url/stream?url=${v}&sub=${sub}`
        : `vlc-x-callback://x-callback-url/stream?url=${v}`;
    case "outplayer":
      return `outplayer://${v}`;
    case "nplayer":
      return `nplayer-${videoUrl}`;
  }
}

// Navigating to a custom-scheme URL launches the app on iOS. If the app isn't
// installed nothing happens, so callers surface an App Store fallback.
export function openExternal(url: string): void {
  if (typeof window === "undefined") return;
  window.location.href = url;
}

export function isExternalPlayerCapable(): boolean {
  // Custom-scheme hand-off is a mobile-web concern; desktop uses the native
  // mpv player and doesn't need it.
  if (typeof window === "undefined") return false;
  if ("__TAURI_INTERNALS__" in window) return false;
  return true;
}
