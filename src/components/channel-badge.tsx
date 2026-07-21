import { lazy, Suspense, useState } from "react";
import { IS_ADMIN } from "@/lib/build-info";

const AdminDashboard = lazy(() =>
  import("./admin/admin-dashboard").then((m) => ({ default: m.AdminDashboard })),
);

// A small marker that only appears on the admin/canary channel (served under
// /admin/). It reassures the owner they are on the bleeding-edge build where
// experiments and breakage are expected — the stable production channel that
// family and friends use never renders it. Tapping it opens the control room.
export function ChannelBadge() {
  const [open, setOpen] = useState(false);
  if (!IS_ADMIN) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open admin control room"
        className="fixed bottom-2 start-2 z-[80] select-none rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-accent ring-1 ring-accent/40 backdrop-blur-sm transition-transform active:scale-95"
        style={{
          marginBottom: "env(safe-area-inset-bottom)",
          marginInlineStart: "env(safe-area-inset-left)",
        }}
      >
        ADMIN
      </button>
      {open && (
        <Suspense fallback={null}>
          <AdminDashboard onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
