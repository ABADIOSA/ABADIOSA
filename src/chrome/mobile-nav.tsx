import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ParentalPinModal } from "@/components/parental-pin-modal";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useParental } from "@/lib/parental";
import { preloadNavPage } from "@/lib/query";
import { useActiveKid } from "@/lib/profiles";
import { useSettings } from "@/lib/settings";
import { useView, type View } from "@/lib/view";
import { NAV_ITEMS, applyNavCustomization, type NavItem } from "@/chrome/nav-items";

// Phone-width replacement for the desktop side navigation: a fixed bottom tab
// bar. Rendered on every layout but hidden by CSS at >=820px, so desktop themes
// keep their own chrome untouched.
export function MobileNav() {
  const { view, setView, chromeHidden } = useView();
  const { locked, unlock, hiddenTabs } = useParental();
  const { settings } = useSettings();
  const { authKey } = useAuth();
  const queryClient = useQueryClient();
  const kid = useActiveKid();
  const t = useT();
  const [pendingPinView, setPendingPinView] = useState<View | null>(null);

  const items = applyNavCustomization(NAV_ITEMS, settings.navCustomization);
  const isItemVisible = (item: NavItem) => {
    if (kid) return item.view === "kids";
    if (item.view === "kids") return false;
    if (item.view === "vod" && !settings.showPlaylistsTab) return false;
    if (item.hideKey && settings.hideContent[item.hideKey]) return false;
    if (locked && item.parentalKey && hiddenTabs[item.parentalKey]) return false;
    return true;
  };
  const visible = items.filter(isItemVisible);
  if (chromeHidden) return null;

  return (
    <>
      <nav
        data-harbor-mobile-nav
        className="fixed inset-x-0 bottom-0 z-[70] hidden max-[819px]:block border-t border-edge-soft bg-canvas/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex w-full items-stretch overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {visible.map((item) => {
            const gated = !!item.pinGated && locked;
            const active = view === item.view;
            return (
              <button
                key={item.id}
                onClick={() => (gated ? setPendingPinView(item.view) : setView(item.view))}
                onPointerDown={() =>
                  preloadNavPage(
                    queryClient,
                    item.view,
                    settings.tmdbKey,
                    settings.region,
                    authKey,
                    settings,
                  )
                }
                aria-label={t(item.label)}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-[64px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10.5px] font-medium transition-colors ${
                  active ? "text-ink" : "text-ink-subtle"
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center [&_svg]:h-full [&_svg]:w-full ${
                    active ? "text-accent" : ""
                  }`}
                >
                  {item.render(active)}
                </span>
                <span className="max-w-[80px] truncate">{t(item.label)}</span>
              </button>
            );
          })}
        </div>
      </nav>
      {pendingPinView !== null && (
        <ParentalPinModal
          mode={{
            kind: "unlock",
            onUnlock: () => {
              const v = pendingPinView;
              setPendingPinView(null);
              if (v) setView(v);
            },
            onCancel: () => setPendingPinView(null),
          }}
          verify={unlock}
        />
      )}
    </>
  );
}
