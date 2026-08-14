import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "@/lib/settings";

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function mpvColor(hex: string, opacity: number): string {
  const rgb = hex.startsWith("#") && hex.length === 7 ? hex.slice(1).toUpperCase() : "FFFFFF";
  const a = Math.round(clamp(opacity, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0")
    .toUpperCase();
  return `#${a}${rgb}`;
}

function mpvFontFor(id: string, customName?: string): string {
  if (id.startsWith("custom:")) return customName || "Inter";
  switch (id) {
    case "arabic":
      return "Vazirmatn";
    case "system":
      return "Segoe UI";
    case "serif":
      return "Times New Roman";
    case "rounded":
      return "Fredoka";
    default:
      return "Inter";
  }
}

function customFontName(s: Settings): string | undefined {
  if (!s.subFontFamily?.startsWith("custom:")) return undefined;
  const id = s.subFontFamily.slice("custom:".length);
  const f = (s.customFonts ?? []).find((x) => x.id === id);
  return f?.family || f?.name;
}

// Presets that ship with zero Arabic-script coverage. When one of these is active on an
// Arabic track, libass finds no glyph and re-selects a font mid-word; that split breaks the
// HarfBuzz shaping run, so letters render in isolated forms instead of joining.
const NO_ARABIC_COVERAGE = new Set(["Inter", "Fredoka", "Noto Sans JP"]);

const ARABIC_SCRIPT_LANGS = new Set([
  "ar", "ara", "arabic",
  "fa", "fas", "per", "persian",
  "ur", "urd", "urdu",
  "ps", "pus", "pashto",
  "ckb", "ku", "kur", "sd", "snd", "ug", "uig",
]);

export function isArabicScriptLang(lang?: string): boolean {
  if (!lang) return false;
  const norm = lang.trim().toLowerCase().replace(/_/g, "-");
  if (!norm) return false;
  if (ARABIC_SCRIPT_LANGS.has(norm)) return true;
  const base = norm.split("-")[0];
  return ARABIC_SCRIPT_LANGS.has(base);
}

// Keeps an explicit choice (the "arabic" preset, or a custom font the user picked) intact and
// only substitutes when the active preset physically cannot render the track's script.
export function subFontFor(s: Settings, trackLang?: string): string {
  const chosen = mpvFontFor(s.subFontFamily, customFontName(s));
  if (isArabicScriptLang(trackLang) && NO_ARABIC_COVERAGE.has(chosen)) return "Vazirmatn";
  return chosen;
}

export type SubRenderContext = {
  assNativeActive: boolean;
  imageNativeActive: boolean;
  assScale?: number;
  trackLang?: string;
};

export async function applySubStyle(
  s: Settings,
  context: SubRenderContext = { assNativeActive: false, imageNativeActive: false },
): Promise<void> {
  const override = s.subAssOverride;
  const normScale =
    typeof context.assScale === "number" && Number.isFinite(context.assScale) ? context.assScale : null;
  const effOverride = normScale != null ? "scale" : override;
  const assMargins = context.assNativeActive && override !== "no" ? "yes" : "no";
  const marginY = clamp(Number(s.subMarginY) || 0, 0, 100);
  const opacity = clamp(Number(s.subOpacity ?? 1), 0.1, 1);
  const boxOpacity = clamp(Number(s.subBoxOpacity ?? 0.6), 0, 1);
  const isBox = s.subStyle === "box";
  const isShadow = s.subStyle === "shadow";
  const reposition = !context.assNativeActive || override !== "no";
  const props: Array<[string, unknown]> = [
    ["sub-font-size", 32],
    ["sub-font", subFontFor(s, context.trackLang)],
    ["sub-scale", normScale != null ? clamp(normScale, 0.2, 6) : Math.min(4, Math.max(0.4, (Number(s.subFontSize) || 32) / 32))],
    ["sub-color", mpvColor(s.subFontColor, opacity)],
    ["sub-border-color", mpvColor(s.subBorderColor, opacity)],
    ["sub-border-size", s.subBorderSize],
    ["sub-back-color", isBox ? mpvColor(s.subBoxColor, boxOpacity * opacity) : "#00000000"],
    ["sub-shadow-color", mpvColor("#000000", opacity)],
    ["sub-shadow-offset", isShadow ? 1.4 : 0],
    ["sub-margin-y", marginY],
    ["sub-align-x", s.subAlignX],
    ["sub-ass-override", effOverride],
    ["sub-ass-force-margins", assMargins],
    ["sub-use-margins", assMargins],
    ["sub-spacing", s.subLineSpacing],
    ["sub-bold", s.subBold ? "yes" : "no"],
    ["sub-pos", reposition ? clamp(100 - marginY, 0, 100) : 100],
  ];
  await Promise.all(
    props.map(([name, value]) =>
      invoke("mpv_set_property", { name, value }).catch(() => {}),
    ),
  );
}
