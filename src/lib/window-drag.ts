import { useSettings } from "@/lib/settings";

const IS_TAURI = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function useContentDrag(): { "data-tauri-drag-region"?: string } {
  const { settings } = useSettings();
  return IS_TAURI && settings.dragAnywhere ? { "data-tauri-drag-region": "" } : {};
}
