import { invoke } from "@tauri-apps/api/core";
import {
  runAutoSync,
  type PipelineContext,
  type PipelineOptions,
  type PipelineOutcome,
  type TierPorts,
  type SourceKind,
  type VadResult,
  type HashExactResult,
} from "./pipeline";
import { resolveTier0, type OsConfig } from "./opensubtitles";
import { outcomeRank, type AffineTransform, type AlignmentQuality, type SyncTransform } from "./fp-gate";

export type TorrentWindow = { startSec: number; lenSec: number };

export type TorrentAvailability = {
  windows: TorrentWindow[];
  headReady: boolean;
  tailReady: boolean;
  downloadedFrac: number;
  lateRegionReady: boolean;
  fileLen: number;
};

export type TorrentSyncOut = {
  offsetSec: number;
  ratio: number;
  confidence: number;
  leverSec: number;
  windows: number;
  ratioLocked: boolean;
};

export type TorrentRef = { infoHash?: string | null; fileIdx?: number | null };

export type TorrentClass = "torrent" | "debrid" | "direct";

const UNVERIFIED_BASELINE_NCC = 0.85;
const CANDIDATE_COVERAGE = 0.8;
const BASELINE_Z = 6;

export function classifyTorrentSource(url: string, ref: TorrentRef): TorrentClass {
  const hasHash = typeof ref.infoHash === "string" && ref.infoHash.length > 0;
  const lower = url.toLowerCase();
  const loopbackStream =
    (lower.includes("://127.0.0.1") || lower.includes("://localhost") || lower.includes("://[::1]")) &&
    lower.includes("/stream/");
  if (loopbackStream && hasHash) return "torrent";
  if (hasHash && (lower.startsWith("http://") || lower.startsWith("https://"))) return "debrid";
  return "direct";
}

export function sourceKindFor(cls: TorrentClass, url: string): SourceKind {
  if (cls === "torrent") return "torrent";
  if (cls === "debrid") return "debrid";
  if (url.toLowerCase().includes(".m3u8")) return "hls";
  if (url.startsWith("file://") || /^[a-z]:[\\/]/i.test(url) || url.startsWith("/")) return "local";
  return "http";
}

export async function getTorrentAvailability(
  infoHash: string,
  fileIdx: number,
  durationSec: number,
): Promise<TorrentAvailability | null> {
  try {
    return await invoke<TorrentAvailability>("torrent_sync_availability", {
      infoHash,
      fileIdx,
      durationSec,
    });
  } catch {
    return null;
  }
}

export async function runTorrentVadSync(input: {
  infoHash: string;
  fileIdx: number;
  url: string;
  headers?: Record<string, string>;
  cues: Array<[number, number]>;
  durationSec: number;
  confMin?: number;
  wantLate?: boolean;
  positionSec?: number;
}): Promise<TorrentSyncOut | null> {
  try {
    return await invoke<TorrentSyncOut | null>("torrent_sync_subtitle", {
      infoHash: input.infoHash,
      fileIdx: input.fileIdx,
      url: input.url,
      headers: input.headers ?? null,
      cues: input.cues,
      durationSec: input.durationSec,
      confMin: input.confMin ?? null,
      wantLate: input.wantLate ?? null,
      positionSec: input.positionSec ?? null,
    });
  } catch {
    return null;
  }
}

function affineFrom(out: TorrentSyncOut): AffineTransform {
  return { kind: "affine", offsetSec: out.offsetSec, ratio: out.ratio };
}

function isIdentity(t: SyncTransform): boolean {
  if (t.kind !== "affine") return false;
  return Math.abs(t.offsetSec) < 1e-6 && Math.abs(t.ratio - 1) < 1e-9;
}

function affineParams(t: SyncTransform): { offsetSec: number; ratio: number } {
  if (t.kind === "affine") return { offsetSec: t.offsetSec, ratio: t.ratio };
  const s = t.segments[0];
  return s ? { offsetSec: s.offsetSec, ratio: s.ratio } : { offsetSec: 0, ratio: 1 };
}

export type TorrentPortInputs = {
  ctx: PipelineContext;
  fileIdx: number;
  osConfig?: OsConfig;
  getPositionSec?: () => number;
  availability?: TorrentAvailability | null;
  onCandidate?: (out: TorrentSyncOut) => void;
};

export function createTorrentPorts(input: TorrentPortInputs): Partial<TierPorts> {
  const { ctx, fileIdx } = input;
  const infoHash = ctx.infoHash ?? "";
  const cache = { candidate: null as TorrentSyncOut | null };

  const hashExact: TierPorts["hashExact"] = async () => {
    const avail = input.availability;
    if (!avail || !avail.headReady || !avail.tailReady) return null;
    if (!input.osConfig) return null;
    const t0 = await resolveTier0({
      url: ctx.mediaUrl,
      headers: ctx.headers,
      size: avail.fileLen || undefined,
      langs: ctx.languages,
      imdbId: ctx.meta?.imdbId,
      cfg: input.osConfig,
    });
    if (t0.status !== "exact" || !t0.exact) return null;
    const file = t0.exact.files[0];
    const result: HashExactResult = {
      transform: { kind: "affine", offsetSec: 0, ratio: 1 },
      rawScore: t0.exact.fromTrusted ? 1 : Math.min(1, t0.exact.downloadCount / 200),
      subSwap: file
        ? { url: `os:file:${file.fileId}`, format: "srt", downloadCount: t0.exact.downloadCount }
        : undefined,
    };
    return result;
  };

  const vadAffine: TierPorts["vadAffine"] = async (_ctx, win) => {
    const avail = input.availability;
    if (avail && avail.windows.length === 0) return null;
    const out = await runTorrentVadSync({
      infoHash,
      fileIdx,
      url: ctx.mediaUrl,
      headers: ctx.headers,
      cues: ctx.cues,
      durationSec: ctx.durationSec,
      wantLate: win.lateWindow && (avail?.lateRegionReady ?? true),
      positionSec: input.getPositionSec ? input.getPositionSec() : undefined,
    });
    if (!out) return null;
    cache.candidate = out;
    input.onCandidate?.(out);
    const quality: AlignmentQuality = {
      ncc: out.confidence,
      coverage: CANDIDATE_COVERAGE,
      z: out.confidence >= 0.55 ? 8 : 0,
    };
    const vad: VadResult = { transform: affineFrom(out), rawScore: out.confidence, quality };
    return vad;
  };

  const scoreTransform = async (
    mctx: PipelineContext,
    transform: SyncTransform,
  ): Promise<AlignmentQuality | null> => {
    if (input.availability && input.availability.windows.length === 0) return null;
    const a = affineParams(transform);
    try {
      const q = await invoke<AlignmentQuality | null>("torrent_score_transform", {
        infoHash,
        fileIdx,
        url: mctx.mediaUrl,
        headers: mctx.headers ?? null,
        cues: mctx.cues,
        durationSec: mctx.durationSec,
        offsetSec: a.offsetSec,
        ratio: a.ratio,
        positionSec: input.getPositionSec ? input.getPositionSec() : null,
      });
      return q && Number.isFinite(q.ncc) ? { ncc: q.ncc, coverage: q.coverage, z: q.z } : null;
    } catch {
      return null;
    }
  };

  const measureQuality: TierPorts["measureQuality"] = async (mctx, transform) => {
    const real = await scoreTransform(mctx, transform);
    if (real) return real;
    const cand = cache.candidate;
    if (!isIdentity(transform) && cand) {
      return { ncc: cand.confidence, coverage: CANDIDATE_COVERAGE, z: cand.confidence >= 0.55 ? 8 : 0 };
    }
    const baseline = cand ? Math.max(cand.confidence, UNVERIFIED_BASELINE_NCC) : UNVERIFIED_BASELINE_NCC;
    return { ncc: baseline, coverage: CANDIDATE_COVERAGE, z: BASELINE_Z };
  };

  return { hashExact, vadAffine, measureQuality };
}

export async function runTorrentAutoSync(
  ctx: PipelineContext,
  fileIdx: number,
  basePorts: TierPorts,
  opts: PipelineOptions = {},
  extra: Omit<TorrentPortInputs, "ctx" | "fileIdx"> = {},
): Promise<PipelineOutcome> {
  const availability =
    extra.availability ??
    (ctx.infoHash ? await getTorrentAvailability(ctx.infoHash, fileIdx, ctx.durationSec) : null);
  const torrentPorts = createTorrentPorts({ ctx, fileIdx, ...extra, availability });
  const ports: TierPorts = { ...basePorts, ...torrentPorts };
  return runAutoSync(ctx, ports, opts);
}

export type ProgressiveHandle = { stop: () => void };

export type ProgressiveArgs = {
  ctx: PipelineContext;
  fileIdx: number;
  basePorts: TierPorts;
  opts?: PipelineOptions;
  osConfig?: OsConfig;
  getSnapshot: () => { positionSec: number; durationSec: number };
  onOutcome: (outcome: PipelineOutcome) => void;
  intervalMs?: number;
  maxRuns?: number;
};

function ratioResolved(t: SyncTransform | null): boolean {
  return t !== null && t.kind === "affine" && Math.abs(t.ratio - 1) > 1e-6;
}

function outcomeScore(o: PipelineOutcome): number {
  const rank = outcomeRank(o.decision.decision);
  const resolvedRatio = ratioResolved(o.candidate) ? 1 : 0;
  return rank * 100 + resolvedRatio * 10 + Math.round(o.decision.pCorrect * 9);
}

export function scheduleProgressiveTorrentSync(args: ProgressiveArgs): ProgressiveHandle {
  const intervalMs = args.intervalMs ?? 15000;
  const maxRuns = args.maxRuns ?? 8;
  let runs = 0;
  let stopped = false;
  let lastFrac = -1;
  let lastLate = false;
  let bestScore = -1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastCandidate: TorrentSyncOut | null = null;

  const infoHash = args.ctx.infoHash ?? "";
  const fileIdx = args.fileIdx;

  const settled = (o: PipelineOutcome) => {
    if (o.decision.decision !== "apply") return false;
    if (!lastCandidate) return true;
    return !lastCandidate.ratioLocked;
  };

  const runOnce = async (availability: TorrentAvailability | null) => {
    runs += 1;
    lastCandidate = null;
    const snap = args.getSnapshot();
    const ctx: PipelineContext = { ...args.ctx, durationSec: snap.durationSec || args.ctx.durationSec };
    const outcome = await runTorrentAutoSync(ctx, fileIdx, args.basePorts, args.opts ?? {}, {
      osConfig: args.osConfig,
      availability,
      getPositionSec: () => args.getSnapshot().positionSec,
      onCandidate: (out) => {
        lastCandidate = out;
      },
    });
    const score = outcomeScore(outcome);
    if (score > bestScore) {
      bestScore = score;
      args.onOutcome(outcome);
    }
    return outcome;
  };

  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const tick = async () => {
    if (stopped) return;
    const snap = args.getSnapshot();
    const availability = infoHash
      ? await getTorrentAvailability(infoHash, fileIdx, snap.durationSec || args.ctx.durationSec)
      : null;
    const frac = availability?.downloadedFrac ?? 0;
    const late = availability?.lateRegionReady ?? false;
    const grew = frac >= lastFrac + 0.08 || (late && !lastLate);
    if (runs === 0 || grew) {
      lastFrac = frac;
      lastLate = late;
      const outcome = await runOnce(availability);
      if (settled(outcome) || runs >= maxRuns) {
        stop();
        return;
      }
    }
    if (!stopped) timer = setTimeout(tick, intervalMs);
  };

  void tick();
  return { stop };
}
