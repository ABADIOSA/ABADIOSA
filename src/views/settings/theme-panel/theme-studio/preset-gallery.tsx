import { THEME_PRESETS, type ThemePreset } from "@/lib/theme";
import { Fit } from "../custom-themes-section/community-store/market/fit";
import { tokensFromPreset } from "../custom-themes-section/community-store/market/fit-palette";
import { PaletteSeam } from "../custom-themes-section/community-store/market/palette-seam";

export function PresetGallery({ onSeed }: { onSeed: (t: ThemePreset) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {Object.values(THEME_PRESETS).map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onSeed(p)}
          title={p.name}
          className="group/card flex flex-col overflow-hidden rounded-[12px] bg-surface text-start outline-none ring-1 ring-edge-soft transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.65)] focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transform-none"
        >
          <div className="relative aspect-[16/10] overflow-hidden bg-elevated">
            <Fit kind="theme" tokens={tokensFromPreset(p)} cover={p.previewImage ?? null} />
            <div className="absolute inset-x-0 bottom-0">
              <PaletteSeam swatch={p.swatch} />
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-0.5 px-3 pb-2.5 pt-2">
            <span className="truncate text-[12.5px] font-semibold text-ink">{p.name}</span>
            {p.blurb && <span className="truncate text-[11.5px] text-ink-subtle">{p.blurb}</span>}
          </div>
        </button>
      ))}
    </div>
  );
}
