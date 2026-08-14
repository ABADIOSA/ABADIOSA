import { useSyncExternalStore } from "react";

let current: string | null = null;
const subs = new Set<() => void>();

function emit(): void {
  for (const s of subs) s();
}

function subscribe(fn: () => void): () => void {
  subs.add(fn);
  return () => {
    subs.delete(fn);
  };
}

export function openLinkOut(url: string): void {
  const trimmed = (url || "").trim();
  if (!trimmed) return;
  current = trimmed;
  emit();
}

export function closeLinkOut(): void {
  current = null;
  emit();
}

export function useLinkOut(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}
