import { Check } from "lucide-react";
import type { ReactNode } from "react";

export function PickGrid({ cols = 2, children }: { cols?: 1 | 2; children: ReactNode }) {
  return <div className={`grid gap-2.5 ${cols === 1 ? "grid-cols-1" : "grid-cols-2"}`}>{children}</div>;
}

export function PickCard({
  selected = false,
  onSelect,
  label,
  hint,
  badgeIcon,
  action,
  children,
}: {
  selected?: boolean;
  onSelect: () => void;
  label: string;
  hint?: string;
  badgeIcon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="group/pick relative">
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full flex-col overflow-hidden rounded-[12px] text-start outline-none transition-[transform,box-shadow,background-color] duration-200 ease-out hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.65)] focus-visible:ring-2 focus-visible:ring-accent motion-reduce:transform-none motion-reduce:transition-none ${
          selected
            ? "bg-accent-soft ring-2 ring-accent"
            : "bg-canvas/40 ring-1 ring-edge-soft hover:bg-elevated/40 hover:ring-edge"
        }`}
      >
        {children}
        <span className="flex items-center gap-1.5 px-3 pb-2.5 pt-2">
          {badgeIcon && <span className="shrink-0 text-ink-subtle">{badgeIcon}</span>}
          <span className="truncate text-[12.5px] font-medium text-ink">{label}</span>
          {hint && <span className="truncate text-[11.5px] text-ink-subtle">{hint}</span>}
        </span>
      </button>
      {selected && (
        <span className="pointer-events-none absolute start-2 top-2 grid h-5 w-5 place-items-center rounded-full bg-accent text-canvas">
          <Check size={12} strokeWidth={3} />
        </span>
      )}
      {action && (
        <span className="absolute end-2 top-2 opacity-0 transition-opacity group-hover/pick:opacity-100 motion-reduce:opacity-100">
          {action}
        </span>
      )}
    </div>
  );
}
