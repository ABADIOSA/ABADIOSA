import { ArrowLeft } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useView } from "@/lib/view";

const DEEP_KINDS = new Set([
  "meta",
  "collection",
  "addon-collection",
  "person",
  "filter",
  "award",
  "anime-award",
  "service",
  "addon-detail",
  "queue",
  "groups",
  "group",
  "list",
]);

export function FloatingBack({
  offsetLeft = 24,
  offsetTop = 90,
}: {
  offsetLeft?: number;
  offsetTop?: number;
}) {
  const { canGoBack, goBack, topKind, chromeHidden } = useView();
  const t = useT();
  if (!canGoBack || chromeHidden) return null;
  if (!DEEP_KINDS.has(topKind)) return null;
  const skin = "border border-edge-soft bg-canvas/90 text-ink-muted shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur-md hover:bg-canvas hover:text-ink";
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={t("common.back")}
      style={{ position: "fixed", top: offsetTop, insetInlineStart: offsetLeft, zIndex: 70 }}
      className={`flex h-10 items-center gap-2 rounded-full ps-3 pe-5 text-[13.5px] font-medium transition-colors ${skin}`}
    >
      <ArrowLeft size={15} className="dir-icon" />
      {t("common.back")}
    </button>
  );
}
