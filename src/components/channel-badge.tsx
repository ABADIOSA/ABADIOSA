import { IS_ADMIN } from "@/lib/build-info";

// A small, unobtrusive marker that only appears on the admin/canary channel
// (served under /admin/). It reassures the owner that they are on the
// bleeding-edge build where experiments and breakage are expected — the stable
// production channel that family and friends use never renders it. Kept
// pointer-events-none so it can never intercept taps over the UI or the player.
export function ChannelBadge() {
  if (!IS_ADMIN) return null;
  return (
    <div
      className="pointer-events-none fixed bottom-2 start-2 z-[80] select-none rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-accent ring-1 ring-accent/40 backdrop-blur-sm"
      style={{
        marginBottom: "env(safe-area-inset-bottom)",
        marginInlineStart: "env(safe-area-inset-left)",
      }}
      aria-hidden
    >
      ADMIN
    </div>
  );
}
