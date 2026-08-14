import { Check, Lock, Pencil, Plus } from "lucide-react";
import { CatAvatar } from "@/components/icons/cat-avatar";
import { useProfiles } from "@/lib/profiles";
import { useT } from "@/lib/i18n";

export function ProfilesStrip() {
  const t = useT();
  const { profiles, activeProfile, openPicker, selectProfile } = useProfiles();
  const compact = profiles.length >= 3;
  const switchTo = (id: string, locked: boolean) =>
    locked ? openPicker({ kind: "unlock", profileId: id }) : selectProfile(id);

  const gridClass = compact
    ? "grid grid-cols-[repeat(auto-fill,minmax(118px,1fr))] gap-2.5"
    : "grid grid-cols-2 gap-3 sm:grid-cols-3";
  const cardPad = compact ? "gap-2.5 p-3.5" : "gap-3.5 p-5";
  const avatarBox = compact ? "h-14 w-14" : "h-[78px] w-[78px]";
  const avatarRing = compact ? 2.5 : 3;
  const nameClass = compact ? "text-[13px]" : "text-[15px]";

  return (
    <div className={gridClass}>
      {profiles.map((p) => {
        const active = activeProfile?.id === p.id;
        const locked = !!p.passwordHash;
        return (
          <div
            key={p.id}
            className={`group relative flex flex-col items-center rounded-2xl border transition-colors duration-200 ${cardPad} ${
              active
                ? "border-transparent bg-elevated/70"
                : "border-edge-soft/50 bg-canvas/30 hover:border-edge-soft hover:bg-elevated/40"
            }`}
            style={active ? { boxShadow: `inset 0 0 0 2px ${p.color}` } : undefined}
          >
            <button
              type="button"
              onClick={() =>
                active ? openPicker({ kind: "edit", profileId: p.id }) : switchTo(p.id, locked)
              }
              aria-label={
                active ? t("Edit {name}", { name: p.name }) : t("Switch to {name}", { name: p.name })
              }
              className={`flex w-full flex-col items-center outline-none ${compact ? "gap-2" : "gap-3.5"}`}
            >
              <span className="relative">
                <span
                  className={`flex items-center justify-center overflow-hidden rounded-full bg-elevated transition-transform duration-200 group-hover:scale-[1.03] ${avatarBox}`}
                  style={{ boxShadow: `0 0 0 ${avatarRing}px ${p.color}` }}
                >
                  {p.avatar ? (
                    <img
                      src={p.avatar}
                      alt=""
                      className="h-full w-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <CatAvatar className="h-full w-full" />
                  )}
                </span>
                {locked && (
                  <span
                    className={`absolute -bottom-0.5 -end-0.5 flex items-center justify-center rounded-full bg-canvas text-ink ring-1 ring-edge ${
                      compact ? "h-5 w-5" : "h-6 w-6"
                    }`}
                  >
                    <Lock size={compact ? 10 : 11} strokeWidth={2.4} />
                  </span>
                )}
              </span>
              <span className="flex w-full flex-col items-center gap-1">
                <span className={`max-w-full truncate font-semibold text-ink ${nameClass}`}>{p.name}</span>
                {active ? (
                  <span className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-accent">
                    <Check size={11} strokeWidth={3} />
                    {t("Active")}
                  </span>
                ) : p.isPrimary ? (
                  <span
                    className="text-[10.5px] font-bold uppercase tracking-[0.14em]"
                    style={{ color: p.color }}
                  >
                    {t("profile.primary")}
                  </span>
                ) : (
                  <span className={compact ? "text-[11px] text-ink-subtle" : "text-[12px] text-ink-subtle"}>
                    {t("Tap to switch")}
                  </span>
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={() => openPicker({ kind: "edit", profileId: p.id })}
              aria-label={t("Edit {name}", { name: p.name })}
              className={`absolute flex items-center justify-center rounded-full text-ink-subtle/70 transition-colors hover:bg-canvas hover:text-ink ${
                compact ? "end-1.5 top-1.5 h-7 w-7" : "end-2.5 top-2.5 h-8 w-8"
              }`}
            >
              <Pencil size={compact ? 13 : 14} strokeWidth={2.2} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => openPicker({ kind: "create" })}
        aria-label={t("Add profile")}
        className={`group flex flex-col items-center justify-center rounded-2xl border border-dashed border-edge-soft/60 text-ink-subtle transition-colors duration-200 hover:border-ink-subtle hover:bg-elevated/30 hover:text-ink ${cardPad}`}
      >
        <span
          className={`flex items-center justify-center rounded-full border-2 border-dashed border-current ${avatarBox}`}
        >
          <Plus size={compact ? 22 : 26} strokeWidth={2.2} />
        </span>
        <span className={`font-semibold ${nameClass}`}>{t("Add")}</span>
      </button>
    </div>
  );
}
