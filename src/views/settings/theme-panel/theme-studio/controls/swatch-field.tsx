import { useState, type ReactNode } from "react";
import { ColorPopover } from "./color-popover";

export function SwatchField({
  value,
  onChange,
  className = "",
  children,
}: {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
  children?: ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <ColorPopover value={value} onChange={onChange} className={`overflow-hidden ${className}`}>
      {(open) => (
        <span
          className="block h-full min-h-11 w-full"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
        >
          <span aria-hidden className="absolute inset-0" style={{ background: value }} />
          <span
            aria-hidden
            className={`absolute inset-0 ring-inset transition-shadow ${open ? "ring-2 ring-accent" : "ring-1 ring-edge-soft"}`}
          />
          {children}
          <span
            aria-hidden
            className={`pointer-events-none absolute end-1.5 top-1.5 rounded-md px-1 py-0.5 text-[10.5px] font-semibold tabular-nums transition-opacity ${
              hover || open ? "opacity-100" : "opacity-0"
            }`}
            style={{ mixBlendMode: "difference", color: "#ffffff" }}
          >
            {value.toUpperCase()}
          </span>
        </span>
      )}
    </ColorPopover>
  );
}
