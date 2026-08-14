import type { GpButton } from "@/lib/gamepad/protocol";
import type { LiveGamepad } from "@/lib/gamepad/live";

export type Layout = "xbox" | "ps";

type P = { x: number; y: number };

const LAYOUT: Record<Layout, Record<string, P>> = {
  xbox: {
    leftStick: { x: 110, y: 118 },
    dpad: { x: 152, y: 182 },
    rightStick: { x: 268, y: 182 },
    face: { x: 310, y: 118 },
    bumperL: { x: 98, y: 62 },
    bumperR: { x: 322, y: 62 },
    triggerL: { x: 98, y: 34 },
    triggerR: { x: 322, y: 34 },
    centerL: { x: 186, y: 114 },
    centerR: { x: 234, y: 114 },
    guide: { x: 210, y: 90 },
  },
  ps: {
    dpad: { x: 110, y: 116 },
    leftStick: { x: 152, y: 184 },
    rightStick: { x: 268, y: 184 },
    face: { x: 310, y: 116 },
    bumperL: { x: 98, y: 62 },
    bumperR: { x: 322, y: 62 },
    triggerL: { x: 98, y: 34 },
    triggerR: { x: 322, y: 34 },
    centerL: { x: 172, y: 110 },
    centerR: { x: 248, y: 110 },
    guide: { x: 210, y: 150 },
  },
};

const BODY =
  "M128 64C96 58 60 66 40 96C20 128 22 176 40 214C58 252 92 262 118 246C138 234 150 206 172 200C190 196 230 196 248 200C270 206 282 234 302 246C328 262 362 252 380 214C398 176 400 128 380 96C360 66 324 58 292 64C256 71 244 74 210 74C176 74 164 71 128 64Z";

const FACE: Record<Layout, Record<"north" | "east" | "south" | "west", { color: string; label: string }>> = {
  xbox: {
    north: { color: "#f2c14e", label: "Y" },
    east: { color: "#e5484d", label: "B" },
    south: { color: "#46c48a", label: "A" },
    west: { color: "#4c9aff", label: "X" },
  },
  ps: {
    north: { color: "#4fd6c2", label: "△" },
    east: { color: "#f76d8a", label: "○" },
    south: { color: "#6f9cff", label: "✕" },
    west: { color: "#d47bf0", label: "□" },
  },
};

function press(live: LiveGamepad, b: GpButton): boolean {
  return !!live.buttons[b];
}

function Stick({ pos, ax, ay, down }: { pos: P; ax: number; ay: number; down: boolean }) {
  const tx = Math.max(-1, Math.min(1, ax)) * 12;
  const ty = Math.max(-1, Math.min(1, ay)) * 12;
  return (
    <g>
      <circle cx={pos.x} cy={pos.y} r={25} className="fill-canvas" stroke="currentColor" strokeOpacity={0.16} strokeWidth={1.5} />
      <circle cx={pos.x} cy={pos.y} r={18.5} className="fill-surface" />
      <g style={{ transform: `translate(${tx}px, ${ty}px) scale(${down ? 0.9 : 1})`, transformOrigin: `${pos.x}px ${pos.y}px`, transition: "transform 80ms linear" }}>
        <circle cx={pos.x} cy={pos.y} r={16} className={down ? "fill-accent" : "fill-raised"} stroke="currentColor" strokeOpacity={0.28} strokeWidth={1.5} style={{ transition: "fill 120ms ease" }} />
        <circle cx={pos.x} cy={pos.y - 3.5} r={6} className="fill-ink" opacity={down ? 0.28 : 0.13} />
      </g>
    </g>
  );
}

function DPad({ pos, live }: { pos: P; live: LiveGamepad }) {
  const arm = 11;
  const w = 12;
  const seg = (b: GpButton, rot: number) => {
    const on = press(live, b);
    return (
      <rect
        key={b}
        x={pos.x - w / 2}
        y={pos.y - arm - w / 2}
        width={w}
        height={arm + w / 2}
        rx={3}
        className={on ? "fill-accent" : "fill-raised"}
        transform={`rotate(${rot} ${pos.x} ${pos.y})`}
        style={{ transition: "fill 90ms ease" }}
      />
    );
  };
  return (
    <g stroke="currentColor" strokeOpacity={0.14} strokeWidth={1}>
      {seg("dup", 0)}
      {seg("ddown", 180)}
      {seg("dleft", 270)}
      {seg("dright", 90)}
      <circle cx={pos.x} cy={pos.y} r={5.5} className="fill-elevated" stroke="none" />
    </g>
  );
}

function FaceButtons({ pos, layout, live }: { pos: P; layout: Layout; live: LiveGamepad }) {
  const R = 20;
  const face = FACE[layout];
  const items: Array<{ b: "north" | "east" | "south" | "west"; dx: number; dy: number }> = [
    { b: "north", dx: 0, dy: -R },
    { b: "east", dx: R, dy: 0 },
    { b: "south", dx: 0, dy: R },
    { b: "west", dx: -R, dy: 0 },
  ];
  return (
    <g>
      {items.map(({ b, dx, dy }) => {
        const on = press(live, b);
        const cx = pos.x + dx;
        const cy = pos.y + dy;
        const info = face[b];
        return (
          <g key={b} style={{ transform: `scale(${on ? 0.9 : 1})`, transformOrigin: `${cx}px ${cy}px`, transition: "transform 90ms ease" }}>
            {on && <circle cx={cx} cy={cy} r={15} fill={info.color} opacity={0.35} style={{ filter: "blur(5px)" }} />}
            <circle cx={cx} cy={cy} r={11.5} className="fill-elevated" stroke={info.color} strokeWidth={on ? 2.4 : 1.8} style={{ transition: "stroke-width 90ms" }} fillOpacity={on ? 0.15 : 1} />
            {on && <circle cx={cx} cy={cy} r={11.5} fill={info.color} opacity={0.85} />}
            <text x={cx} y={cy} dominantBaseline="central" textAnchor="middle" fontSize={layout === "ps" ? 11 : 10.5} fontWeight={700} fill={on ? "#0d1017" : info.color} style={{ transition: "fill 90ms" }}>
              {info.label}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Bumper({ pos, on, label }: { pos: P; on: boolean; label: string }) {
  return (
    <g style={{ transform: on ? "translateY(1.5px)" : "none", transition: "transform 80ms ease" }}>
      <rect x={pos.x - 34} y={pos.y - 9} width={68} height={18} rx={9} className={on ? "fill-accent" : "fill-raised"} stroke="currentColor" strokeOpacity={0.16} strokeWidth={1} style={{ transition: "fill 90ms ease" }} />
      <text x={pos.x} y={pos.y} dominantBaseline="central" textAnchor="middle" fontSize={9} fontWeight={700} className={on ? "fill-canvas" : "fill-ink-muted"}>
        {label}
      </text>
    </g>
  );
}

function Trigger({ pos, on, label }: { pos: P; on: boolean; label: string }) {
  return (
    <g style={{ transform: on ? "translateY(3px)" : "none", transition: "transform 90ms ease" }}>
      <rect x={pos.x - 26} y={pos.y - 11} width={52} height={20} rx={9} className={on ? "fill-accent" : "fill-elevated"} stroke="currentColor" strokeOpacity={0.16} strokeWidth={1} style={{ transition: "fill 90ms ease" }} />
      <text x={pos.x} y={pos.y - 1} dominantBaseline="central" textAnchor="middle" fontSize={9} fontWeight={700} className={on ? "fill-canvas" : "fill-ink-muted"}>
        {label}
      </text>
    </g>
  );
}

function CenterButton({ pos, on }: { pos: P; on: boolean }) {
  return <rect x={pos.x - 8} y={pos.y - 4} width={16} height={8} rx={4} className={on ? "fill-accent" : "fill-raised"} style={{ transition: "fill 90ms ease" }} />;
}

export function ControllerSvg({ layout, live }: { layout: Layout; live: LiveGamepad }) {
  const L = LAYOUT[layout];
  const guideOn = press(live, "guide");
  return (
    <svg viewBox="0 0 420 300" className="w-full text-ink" role="img" aria-label="Controller preview">
      <path d={BODY} className="fill-elevated" stroke="currentColor" strokeOpacity={0.18} strokeWidth={2} />
      <path d={BODY} fill="none" stroke="#000" strokeOpacity={0.25} strokeWidth={2} transform="translate(0 2)" style={{ mixBlendMode: "multiply" }} />

      <Trigger pos={L.triggerL} on={press(live, "lt")} label="LT" />
      <Trigger pos={L.triggerR} on={press(live, "rt")} label="RT" />
      <Bumper pos={L.bumperL} on={press(live, "lb")} label="LB" />
      <Bumper pos={L.bumperR} on={press(live, "rb")} label="RB" />

      <CenterButton pos={L.centerL} on={press(live, "back")} />
      <CenterButton pos={L.centerR} on={press(live, "start")} />
      <circle cx={L.guide.x} cy={L.guide.y} r={layout === "ps" ? 9 : 12} className={guideOn ? "fill-accent" : "fill-raised"} stroke="currentColor" strokeOpacity={0.2} strokeWidth={1.2} style={{ transition: "fill 120ms ease" }} />

      <DPad pos={L.dpad} live={live} />
      <FaceButtons pos={L.face} layout={layout} live={live} />
      <Stick pos={L.leftStick} ax={live.axes.lx} ay={live.axes.ly} down={press(live, "lstick")} />
      <Stick pos={L.rightStick} ax={live.axes.rx} ay={live.axes.ry} down={press(live, "rstick")} />
    </svg>
  );
}
