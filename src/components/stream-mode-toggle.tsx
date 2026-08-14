export type StreamMode = "both" | "addons" | "p2p";

const MODES: Array<{ v: StreamMode; label: string }> = [
  { v: "both", label: "Both" },
  { v: "addons", label: "Addons" },
  { v: "p2p", label: "P2P" },
];

export function StreamModeToggle({
  mode,
  onChange,
  className = "",
}: {
  mode: StreamMode;
  onChange: (m: StreamMode) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Source mode"
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-full border border-edge-soft bg-surface/70 p-0.5 ${className}`}
    >
      {MODES.map((m) => (
        <button
          key={m.v}
          type="button"
          onClick={() => onChange(m.v)}
          aria-pressed={mode === m.v}
          title={
            m.v === "both"
              ? "Use debrid/addon sources and fall back to peer-to-peer"
              : m.v === "addons"
                ? "Only addon/debrid sources, never peer-to-peer"
                : "Only peer-to-peer torrent sources"
          }
          className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors ${
            mode === m.v ? "bg-accent text-canvas" : "text-ink-muted hover:text-ink"
          }`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
