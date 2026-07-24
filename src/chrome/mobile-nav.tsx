import { useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
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
  const [moreOpen, setMoreOpen] = useState(false);

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

  // A phone fits about five tabs. Showing every destination made the bar scroll
  // sideways with tabs clipped at both edges, so keep four primary tabs at fixed
  // widths and move the rest into a "More" sheet.
  const PRIMARY = 4;
  const primary = visible.slice(0, PRIMARY);
  const overflow = visible.slice(PRIMARY);
  const overflowActive = overflow.some((i) => i.view === view);

  const go = (item: NavItem) => {
    setMoreOpen(false);
    if (item.pinGated && locked) setPendingPinView(item.view);
    else setView(item.view);
  };
  const prefetch = (item: NavItem) =>
    preloadNavPage(queryClient, item.view, settings.tmdbKey, settings.region, authKey, settings);

  return (
    <>
      <nav
        data-harbor-mobile-nav
        className="fixed inset-x-0 bottom-0 z-[70] hidden max-[819px]:block border-t border-edge-soft bg-canvas/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex w-full items-stretch">
          {primary.map((item) => {
            const active = view === item.view;
            return (
              <button
                key={item.id}
                onClick={() => go(item)}
                onPointerDown={() => prefetch(item)}
                aria-label={t(item.label)}
                aria-current={active ? "page" : undefined}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10.5px] font-medium transition-colors ${
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
                <span className="w-full truncate px-1 text-center">{t(item.label)}</span>
              </button>
            );
          })}
          {overflow.length > 0 && (
            <button
              onClick={() => setMoreOpen(true)}
              aria-label={t("More")}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10.5px] font-medium transition-colors ${
                overflowActive ? "text-ink" : "text-ink-subtle"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center ${overflowActive ? "text-accent" : ""}`}
              >
                <MoreHorizontal size={22} />
              </span>
              <span className="w-full truncate px-1 text-center">{t("More")}</span>
            </button>
          )}
        </div>
      </nav>

      {moreOpen && (
        <div
          className="fixed inset-0 z-[75] flex items-end bg-black/60 max-[819px]:flex min-[820px]:hidden"
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="max-h-[70vh] w-full overflow-y-auto rounded-t-3xl border-t border-edge-soft bg-canvas p-4"
            style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-edge" />
            <div className="grid grid-cols-4 gap-2">
              {overflow.map((item) => {
                const active = view === item.view;
                return (
                  <button
                    key={item.id}
                    onClick={() => go(item)}
                    onPointerDown={() => prefetch(item)}
                    className={`flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 text-[11px] font-medium transition-colors ${
                      active ? "bg-elevated text-ink" : "text-ink-muted"
                    }`}
                  >
                    <span
                      className={`flex h-6 w-6 items-center justify-center [&_svg]:h-full [&_svg]:w-full ${
                        active ? "text-accent" : ""
                      }`}
                    >
                      {item.render(active)}
                    </span>
                    <span className="w-full truncate text-center">{t(item.label)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
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
