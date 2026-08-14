import { useState } from "react";

export function BeforeAfter({ demo }: { demo: { before: string; after: string; credit: string } }) {
  const [pos, setPos] = useState(50);
  const [broken, setBroken] = useState(false);

  if (broken) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-edge-soft bg-canvas/60">
        <img
          src={demo.before}
          alt="Before"
          draggable={false}
          onError={() => setBroken(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 overflow-hidden" style={{ width: `${pos}%` }}>
          <img
            src={demo.after}
            alt="After"
            draggable={false}
            onError={() => setBroken(true)}
            className="h-full w-full object-cover"
            style={{ width: `${(100 / Math.max(pos, 1)) * 100}%`, maxWidth: "none" }}
          />
        </div>
        <span
          aria-hidden
          className="absolute top-0 bottom-0 w-px bg-canvas/90"
          style={{ left: `${pos}%` }}
        />
        <span className="absolute left-2 top-2 rounded-full bg-canvas/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
          After
        </span>
        <span className="absolute right-2 top-2 rounded-full bg-canvas/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
          Before
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Compare before and after"
        className="w-full accent-ink"
      />
      <span className="text-[11px] text-ink-muted">Comparison by {demo.credit}</span>
    </div>
  );
}
