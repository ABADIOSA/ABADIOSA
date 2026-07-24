import abadiosaMark from "@/assets/abadiosa-mark.png";

// The app mark: the ABADIOSA golden emblem. Kept as the HarborMark component
// name so every existing call site picks up the new brand unchanged.
export function HarborMark({ className }: { className?: string }) {
  return (
    <img
      src={abadiosaMark}
      alt=""
      draggable={false}
      aria-hidden
      className={`object-contain ${className ?? ""}`}
    />
  );
}
