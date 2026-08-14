import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { suwayomiAuthFor } from "@/lib/manga/sources/suwayomi/auth-registry";

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type HarborFetchResponse = {
  status: number;
  ok: boolean;
  body: string;
  contentType?: string | null;
  headers?: Record<string, string>;
};

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.trim());
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Remote plain-HTTP images are blocked by the WebView as mixed content: the app
// page is a secure context, so http://localhost is exempt but http://<remote>
// is refused (https is fine). Route those through the Rust side and hand back a
// same-origin blob URL. Covers e.g. a Suwayomi server hosted on a VPS over HTTP.
export function needsImageProxy(url: string): boolean {
  if (!isTauri) return false;
  // An <img> tag cannot send an Authorization header, so any server behind
  // basic auth must be fetched through Rust regardless of scheme.
  if (suwayomiAuthFor(url)) return true;
  if (!url.startsWith("http://")) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return !(host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost"));
  } catch {
    return false;
  }
}

const blobCache = new Map<string, string>();

export function useProxiedImageSrc(url: string | undefined): string | undefined {
  const need = !!url && needsImageProxy(url);
  const [blob, setBlob] = useState<string | undefined>(() =>
    url && need ? blobCache.get(url) : undefined,
  );
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
    if (!url || !need) {
      setBlob(undefined);
      return;
    }
    const cached = blobCache.get(url);
    if (cached) {
      setBlob(cached);
      return;
    }
    setBlob(undefined);
    let alive = true;
    (async () => {
      try {
        const auth = suwayomiAuthFor(url);
        const resp = await invoke<HarborFetchResponse>("harbor_fetch", {
          args: {
            url,
            method: "GET",
            responseType: "base64",
            timeoutMs: 30000,
            headers: auth ? { authorization: auth } : undefined,
          },
        });
        if (!resp.ok) throw new Error(`status ${resp.status}`);
        const type = resp.headers?.["content-type"] || resp.contentType || "image/jpeg";
        if (type && !type.startsWith("image/")) throw new Error(`type ${type}`);
        const created = URL.createObjectURL(new Blob([base64ToBytes(resp.body)], { type }));
        blobCache.set(url, created);
        if (alive) setBlob(created);
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [url, need]);
  if (!need) return url;
  // Loading -> undefined (caller shows its placeholder/shimmer). Failed -> the
  // original url so the <img> errors and the caller's fallback/plate logic runs.
  return blob ?? (failed ? url : undefined);
}
