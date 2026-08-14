import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useT } from "@/lib/i18n";
import { NavArrow } from "./nav-arrow";

type DragState = {
  active: boolean;
  moved: boolean;
  startX: number;
  startScroll: number;
  pointerId: number;
};

const DRAG_THRESHOLD = 6;

export function ArrowedScrollRow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>({
    active: false,
    moved: false,
    startX: 0,
    startScroll: 0,
    pointerId: 0,
  });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [grabbing, setGrabbing] = useState(false);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const update = () => {
      setCanPrev(el.scrollLeft > 2);
      setCanNext(el.scrollWidth - (el.scrollLeft + el.clientWidth) > 2);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const scroll = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType === "touch") return;
    const el = trackRef.current;
    if (!el) return;
    dragRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      pointerId: e.pointerId,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    const el = trackRef.current;
    if (!d.active || !el) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setGrabbing(true);
      try {
        el.setPointerCapture(d.pointerId);
      } catch {
        /* ignore */
      }
    }
    el.scrollLeft = d.startScroll - dx;
  };

  const endDrag = () => {
    const d = dragRef.current;
    const el = trackRef.current;
    if (!d.active) return;
    d.active = false;
    setGrabbing(false);
    if (d.moved && el) {
      try {
        el.releasePointerCapture(d.pointerId);
      } catch {
        /* ignore */
      }
    }
    if (d.moved) {
      // Block the next click so a drag-up on a card doesn't fire its onClick
      window.setTimeout(() => {
        dragRef.current.moved = false;
      }, 0);
    }
  };

  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (dragRef.current.moved) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        className={`-my-3 flex gap-3 overflow-x-auto px-1 py-3 select-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [overflow-anchor:none] [overscroll-behavior-x:contain] ${grabbing ? "cursor-grabbing" : "cursor-grab"}`}
        style={{ contain: "layout style", transform: "translateZ(0)" }}
      >
        {children}
      </div>
      <Arrow side="left" visible={canPrev} onClick={() => scroll(-1)} />
      <Arrow side="right" visible={canNext} onClick={() => scroll(1)} />
    </div>
  );
}

function Arrow({
  side,
  visible,
  onClick,
}: {
  side: "left" | "right";
  visible: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <NavArrow
      dir={side}
      onClick={onClick}
      label={t(side === "left" ? "Scroll left" : "Scroll right")}
      size={28}
      className={`absolute top-1/2 z-20 h-11 w-11 -translate-y-1/2 transition-opacity ${
        side === "left" ? "start-1" : "end-1"
      } ${visible ? "opacity-100" : "pointer-events-none opacity-0"}`}
    />
  );
}
