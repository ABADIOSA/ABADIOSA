import { useEffect, useState } from "react";
import { meta as fetchCinemeta } from "@/lib/cinemeta";
import previewPoster1 from "@/assets/preview/poster1.webp";

const SAMPLE_ID = "tt0468569";
const CACHE_KEY = "harbor.sample-artwork.v1";

export type SampleArtwork = { poster: string; background: string | null; logo: string | null };

const FALLBACK: SampleArtwork = { poster: previewPoster1, background: null, logo: null };

let cache: SampleArtwork | null = null;
let inflight: Promise<SampleArtwork> | null = null;

function readCache(): SampleArtwork | null {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      cache = JSON.parse(raw) as SampleArtwork;
      return cache;
    }
  } catch {
    return null;
  }
  return null;
}

async function load(): Promise<SampleArtwork> {
  const cached = readCache();
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = (async () => {
    const m = await fetchCinemeta("movie", SAMPLE_ID).catch(() => null);
    const art: SampleArtwork = {
      poster: m?.poster ?? previewPoster1,
      background: m?.background ?? null,
      logo: m?.logo ?? null,
    };
    cache = art;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(art));
    } catch {
      /* preview art is best-effort */
    }
    return art;
  })();
  return inflight;
}

export function useSampleArtwork(): SampleArtwork {
  const [art, setArt] = useState<SampleArtwork>(() => readCache() ?? FALLBACK);
  useEffect(() => {
    let cancel = false;
    void load().then((a) => {
      if (!cancel) setArt(a);
    });
    return () => {
      cancel = true;
    };
  }, []);
  return art;
}

const POSTER_PREFIX = "harbor.sample-poster.v1.";
const posterMem = new Map<string, string>();
const posterInflight = new Map<string, Promise<string>>();

function readPoster(imdbId: string): string | null {
  const mem = posterMem.get(imdbId);
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(POSTER_PREFIX + imdbId);
    if (raw) {
      posterMem.set(imdbId, raw);
      return raw;
    }
  } catch {
    return null;
  }
  return null;
}

async function loadPoster(imdbId: string, type: "movie" | "series", fallback: string): Promise<string> {
  const have = readPoster(imdbId);
  if (have) return have;
  const pending = posterInflight.get(imdbId);
  if (pending) return pending;
  const p = (async () => {
    const m = await fetchCinemeta(type, imdbId).catch(() => null);
    if (m?.poster) {
      posterMem.set(imdbId, m.poster);
      try {
        localStorage.setItem(POSTER_PREFIX + imdbId, m.poster);
      } catch {
        /* best-effort */
      }
      return m.poster;
    }
    return fallback;
  })();
  posterInflight.set(imdbId, p);
  const out = await p;
  posterInflight.delete(imdbId);
  return out;
}

export function useHydratedPoster(
  imdbId: string,
  fallback: string = previewPoster1,
  type: "movie" | "series" = "movie",
): string {
  const [poster, setPoster] = useState<string>(() => readPoster(imdbId) ?? fallback);
  useEffect(() => {
    let cancel = false;
    void loadPoster(imdbId, type, fallback).then((p) => {
      if (!cancel) setPoster(p);
    });
    return () => {
      cancel = true;
    };
  }, [imdbId, type, fallback]);
  return poster;
}
