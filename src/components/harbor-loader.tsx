import { useEffect } from "react";
import abadiosaMark from "@/assets/abadiosa-mark.png";

type Size = "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<Size, string> = {
  sm: "h-20 w-20",
  md: "h-32 w-32",
  lg: "h-44 w-44",
  xl: "h-60 w-60",
};

// Brand loader: the ABADIOSA emblem with a soft pulse. Keeps the original
// lottie loader's prop contract (keyed/logos are accepted and ignored) so
// every call site keeps working unchanged.
export function HarborLoader(props: {
  size?: Size;
  caption?: string;
  className?: string;
  keyed?: boolean;
  logos?: string[];
  onReady?: () => void;
}) {
  const { size = "md", caption, className = "", onReady } = props;
  useEffect(() => {
    const frame = requestAnimationFrame(() => onReady?.());
    return () => cancelAnimationFrame(frame);
  }, [onReady]);
  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${className}`}>
      <div className={`relative ${SIZE_CLASS[size]}`} aria-hidden>
        <img
          src={abadiosaMark}
          alt=""
          draggable={false}
          className="abadiosa-loader-pulse h-full w-full object-contain"
        />
      </div>
      {caption && (
        <p className="mt-1 text-[12.5px] font-medium uppercase tracking-[0.18em] text-white/70">
          {caption}
        </p>
      )}
    </div>
  );
}
