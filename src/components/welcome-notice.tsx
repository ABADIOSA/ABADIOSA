import { Check, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { managedActive } from "@/lib/access/managed";
import { useT } from "@/lib/i18n";
import { useOnboarding } from "@/lib/onboarding";
import { useSettings } from "@/lib/settings";
import { useView } from "@/lib/view";

// People handed the app by the admin shouldn't have to answer a seven-step
// setup wizard — the addons, debrid and languages are already decided for them.
// So on a managed device we apply sensible defaults, mark onboarding done, and
// show this single notice explaining what was chosen and where to change it.
const DEFAULT_LANGS = ["Arabic", "English"];

export function WelcomeNotice() {
  const { onboarded, finishOnboarding } = useOnboarding();
  const { settings, update } = useSettings();
  const { openSettings } = useView();
  const t = useT();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!managedActive() || onboarded) return;
    // Apply the defaults once, then retire the wizard for good.
    const patch: Record<string, unknown> = {};
    if ((settings.preferredLanguages ?? []).length === 0) patch.preferredLanguages = DEFAULT_LANGS;
    if ((settings.preferredSubLangs ?? []).length === 0) patch.preferredSubLangs = DEFAULT_LANGS;
    if ((settings.preferredAudioLangs ?? []).length === 0)
      patch.preferredAudioLangs = DEFAULT_LANGS;
    if (Object.keys(patch).length > 0) update(patch);
    finishOnboarding();
    setShow(true);
  }, [onboarded, settings, update, finishOnboarding]);

  if (!show) return null;

  const lines = [
    t("Subtitles and audio: Arabic, then English"),
    t("Sources and addons are set up for you"),
    t("Your watch history stays on this device"),
  ];

  return (
    <div
      className="fixed inset-0 z-[320] flex items-end justify-center bg-black/70 px-4 sm:items-center"
      dir="auto"
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-elevated p-6 ring-1 ring-edge-soft sm:rounded-3xl"
        style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))" }}
      >
        <h2 className="font-display text-[22px] font-semibold text-ink">
          {t("Welcome to ABADIOSA")}
        </h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-muted">
          {t("Everything is ready — no setup needed. These are your defaults:")}
        </p>
        <ul className="mt-4 flex flex-col gap-2.5">
          {lines.map((line) => (
            <li key={line} className="flex items-start gap-2.5 text-[14px] text-ink">
              <Check size={16} className="mt-0.5 shrink-0 text-accent" strokeWidth={2.5} />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13px] leading-relaxed text-ink-subtle">
          {t("You can change any of this later from Settings.")}
        </p>
        <div className="mt-5 flex gap-2">
          <button
            onClick={() => setShow(false)}
            className="h-12 flex-1 rounded-2xl bg-ink text-[15px] font-semibold text-canvas"
          >
            {t("Start watching")}
          </button>
          <button
            onClick={() => {
              setShow(false);
              openSettings();
            }}
            aria-label={t("Settings")}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-ink-muted ring-1 ring-edge-soft transition-colors hover:text-ink"
          >
            <Settings2 size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
