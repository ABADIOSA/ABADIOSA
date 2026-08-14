import { ContentAdvisoryToast, type Advisory } from "@/components/player/content-advisory-toast";
import { useSampleArtwork } from "@/lib/sample-artwork";
import { useT } from "@/lib/i18n";

const SAMPLE: Advisory[] = [
  { category: "Violence", severity: "Severe" },
  { category: "Profanity", severity: "Moderate" },
  { category: "Frightening", severity: "Mild" },
];

export function AdvisoryPreview() {
  const t = useT();
  const art = useSampleArtwork();
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-edge-soft bg-canvas/40 p-5">
      <div className="relative aspect-video w-full max-w-[380px] overflow-hidden rounded-xl bg-canvas ring-1 ring-edge-soft">
        {art.background && (
          <img
            src={art.background}
            alt=""
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-br from-black/45 via-black/10 to-transparent" />
        <div className="absolute start-3 top-3 origin-top-left scale-[0.8]">
          <ContentAdvisoryToast preview categories={SAMPLE} playKey="advisory-preview" />
        </div>
      </div>
      <span className="text-[11.5px] font-medium text-ink-subtle">{t("Live preview")}</span>
    </div>
  );
}
