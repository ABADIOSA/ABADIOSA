import { isTauri } from "@tauri-apps/api/core";

function dataUrlToBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  try {
    const bin = atob(dataUrl.slice(comma + 1));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i);
    return arr;
  } catch {
    return null;
  }
}

export type ApplyIconResult = { ok: true } | { ok: false; reason: string };

export async function applyAppIcon(dataUrl: string): Promise<ApplyIconResult> {
  if (!isTauri()) return { ok: false, reason: "not running in the desktop app" };
  if (!dataUrl) return { ok: false, reason: "no icon selected" };
  const bytes = dataUrlToBytes(dataUrl);
  if (!bytes) return { ok: false, reason: "could not read the icon image" };
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setIcon(bytes);
    return { ok: true };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[harbor] app icon setIcon failed:", reason);
    return { ok: false, reason };
  }
}
