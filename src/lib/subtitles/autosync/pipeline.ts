import {
  fuseConfidence,
  isAgreeingSignal,
  DEFAULT_PRIOR,
  type SignalEvidence,
  type TierId,
  type Calibrator,
  type CrowdTier,
} from "./confidence";
import {
  evaluateBestEffort,
  evaluateGate,
  outcomeRank,
  DEFAULT_BOUNDS,
  type AlignmentQuality,
  type Bounds,
  type GateDecision,
  type SyncTransform,
  type AffineTransform,
} from "./fp-gate";
import {
  classifyContent,
  metadataEvidence,
  subtitleShapeFromCues,
  type ClassCVerdict,
  type EpisodeRef,
} from "./metadata-priors";
import type { SwapCues } from "./opensubtitles";
import { escalateTryHarder, consensusAnchorFit, consensusSignal, wrongContentOutcome } from "./smart-layer";

export type SourceKind = "local" | "http" | "hls" | "debrid" | "torrent";

export type ConsensusCandidate = { url: string; lang: string; source: string; format?: string };
export type ConsensusResult = {
  verdict: "right" | "wrong" | "unknown";
  bestCandidate: ConsensusCandidate | null;
  agreement: number;
  textAnchors: Array<[number, number]> | null;
};
export type AsrWindowSpec = { startSec: number; lenSec: number };
export type AsrPhrase = { start: number; end: number; text: string };

export type MediaMeta = {
  expectedRuntimeSec?: number;
  fps?: number;
  imdbId?: string;
  tmdbId?: number;
  season?: number;
  episode?: number;
  isAnime?: boolean;
};

export type PipelineContext = {
  mediaUrl: string;
  headers?: Record<string, string>;
  infoHash?: string | null;
  sourceKind: SourceKind;
  durationSec: number;
  cues: Array<[number, number]>;
  cueText?: string[];
  moviehash?: string;
  moviebytesize?: number;
  languages: string[];
  meta?: MediaMeta;
};

export type WindowPolicy = { earlyWindow: boolean; lateWindow: boolean };

export type SwapRef = { url: string; format: "srt" | "vtt"; downloadCount?: number };
export type { SwapCues };

export type HashExactResult = {
  transform: SyncTransform;
  rawScore: number;
  subSwap?: SwapRef;
};
export type CrowdResult = {
  transform: SyncTransform;
  rawScore: number;
  votes: number;
  verified: boolean;
  tier: CrowdTier;
};
export type VadResult = { transform: AffineTransform; rawScore: number; quality: AlignmentQuality };
export type PiecewiseResult = { transform: SyncTransform; rawScore: number; quality: AlignmentQuality };
export type AsrResult = { wordMatch: number; supportsTransform: number };

export type TierPorts = {
  metadataBounds?: (ctx: PipelineContext, base: Bounds) => Bounds;
  hashExact?: (ctx: PipelineContext) => Promise<HashExactResult | null>;
  crowdDb?: (ctx: PipelineContext) => Promise<CrowdResult | null>;
  consensus?: (ctx: PipelineContext) => Promise<ConsensusResult | null>;
  vadAffine?: (ctx: PipelineContext, win: WindowPolicy) => Promise<VadResult | null>;
  vadPiecewise?: (ctx: PipelineContext, seed: SyncTransform) => Promise<PiecewiseResult | null>;
  asrMatch?: (ctx: PipelineContext, candidate: SyncTransform) => Promise<AsrResult | null>;
  asrTranscribe?: (ctx: PipelineContext, windows: AsrWindowSpec[]) => Promise<AsrPhrase[]>;
  resolveSwapCues?: (ctx: PipelineContext, swap: SwapRef) => Promise<SwapCues | null>;
  measureQuality: (ctx: PipelineContext, transform: SyncTransform) => Promise<AlignmentQuality>;
};

export type PipelineOptions = {
  tryHarder?: boolean;
  prior?: number;
  calibrators?: Partial<Record<TierId, Calibrator>>;
};

export type PipelineOutcome = {
  decision: GateDecision;
  candidate: SyncTransform | null;
  subSwap?: { url: string; format: "srt" | "vtt"; lang?: string; source?: string };
  evidence: SignalEvidence[];
  tiersRun: TierId[];
  bestEffort?: boolean;
};

const IDENTITY: AffineTransform = { kind: "affine", offsetSec: 0, ratio: 1 };
const MIN_SWAP_CUES = 4;

const TIERS: Record<TierId, { cal: Calibrator; rel: number; group: string }> = {
  hash_exact: { cal: { kind: "identity" }, rel: 0.99, group: "hash" },
  crowd_db: { cal: { kind: "identity" }, rel: 0.9, group: "crowd" },
  vad_affine: { cal: { kind: "platt", a: 8.8, b: -4.8 }, rel: 0.75, group: "vad" },
  vad_piecewise: { cal: { kind: "platt", a: 8.0, b: -4.4 }, rel: 0.7, group: "vad" },
  asr_match: { cal: { kind: "platt", a: 9.8, b: -3.7 }, rel: 0.85, group: "asr" },
  consensus: { cal: { kind: "platt", a: 6, b: -3 }, rel: 0.6, group: "consensus" },
  metadata_prior: { cal: { kind: "identity" }, rel: 0.4, group: "meta" },
};

function signal(
  tier: TierId,
  rawScore: number,
  clearedFloor: boolean,
  opts: PipelineOptions,
  extra?: Partial<SignalEvidence>,
): SignalEvidence {
  const t = TIERS[tier];
  return {
    tier,
    rawScore,
    calibrator: opts.calibrators?.[tier] ?? t.cal,
    reliability: t.rel,
    independenceGroup: t.group,
    clearedFloor,
    ...extra,
  };
}

function windowPolicy(kind: SourceKind, tryHarder: boolean): WindowPolicy {
  if (kind === "torrent" || kind === "debrid") return { earlyWindow: true, lateWindow: tryHarder };
  return { earlyWindow: true, lateWindow: true };
}

function buildBounds(ctx: PipelineContext, ports: TierPorts): Bounds {
  const base: Bounds = { ...DEFAULT_BOUNDS };
  const exp = ctx.meta?.expectedRuntimeSec;
  if (exp && ctx.durationSec > 0 && Math.abs(ctx.durationSec - exp) < exp * 0.02) {
    base.maxOffsetSec = Math.min(base.maxOffsetSec, 20);
  }
  return ports.metadataBounds ? ports.metadataBounds(ctx, base) : base;
}

function runtimeOk(ctx: PipelineContext): boolean | undefined {
  const exp = ctx.meta?.expectedRuntimeSec;
  if (!exp || ctx.durationSec <= 0) return undefined;
  return Math.abs(ctx.durationSec - exp) <= exp * 0.15;
}

function episodeRefFromMeta(meta: MediaMeta): EpisodeRef {
  const kind = meta.season !== undefined && meta.episode !== undefined ? "episode" : "movie";
  return {
    kind,
    imdbId: meta.imdbId,
    tmdbId: meta.tmdbId,
    season: meta.season,
    episode: meta.episode,
    isAnime: meta.isAnime,
  };
}

function affineApprox(t: SyncTransform): { offsetSec: number; ratio: number } {
  if (t.kind === "affine") return { offsetSec: t.offsetSec, ratio: t.ratio };
  const s = t.segments[0];
  return s ? { offsetSec: s.offsetSec, ratio: s.ratio } : { offsetSec: 0, ratio: 1 };
}

function isAlreadyGood(before: AlignmentQuality, t: SyncTransform): boolean {
  const a = affineApprox(t);
  return before.ncc >= 0.85 && Math.abs(a.offsetSec) < 0.25 && Math.abs(a.ratio - 1) < 0.003;
}

function needsPiecewise(v: VadResult): boolean {
  return v.quality.coverage < 0.75 && v.quality.ncc >= 0.5;
}

function crowdReliability(c: CrowdResult): number {
  const v = Math.min(1, c.votes / 5);
  return 0.6 + 0.35 * v;
}

function shouldRunAsr(
  evidence: SignalEvidence[],
  ctx: PipelineContext,
  opts: PipelineOptions,
  verdict: ClassCVerdict | null,
): boolean {
  if (opts.tryHarder) return true;
  const structural = evidence.some((e) => e.independenceGroup === "vad" && e.clearedFloor);
  if (!structural) return false;
  if (verdict?.demandAsr === true) return true;
  const independentCleared = new Set(
    evidence.filter(isAgreeingSignal).map((e) => e.independenceGroup),
  );
  const anime =
    ctx.meta?.isAnime === true ||
    (ctx.meta?.season !== undefined && ctx.meta?.episode !== undefined);
  return independentCleared.size < 2 || anime;
}

export async function runAutoSync(
  ctx: PipelineContext,
  ports: TierPorts,
  opts: PipelineOptions = {},
): Promise<PipelineOutcome> {
  const prior = opts.prior ?? DEFAULT_PRIOR;
  const bounds = buildBounds(ctx, ports);
  const qualityBeforeP = ports.measureQuality(ctx, IDENTITY);
  const consensusP: Promise<ConsensusResult | null> = ports.consensus
    ? ports.consensus(ctx).catch(() => null)
    : Promise.resolve(null);
  const priorRuntimeOk = runtimeOk(ctx);
  const evidence: SignalEvidence[] = [];
  const tiersRun: TierId[] = [];
  let metaVerdict: ClassCVerdict | null = null;

  let best: PipelineOutcome = {
    decision: { decision: "refuse", reason: "no candidate produced", bindingRule: "default", pCorrect: prior, transform: IDENTITY },
    candidate: null,
    evidence,
    tiersRun,
  };

  const keep = (out: PipelineOutcome) => {
    if (outcomeRank(out.decision.decision) > outcomeRank(best.decision.decision)) best = out;
  };

  const gateFor = async (
    transform: SyncTransform,
    exactIdentity: boolean,
    over: {
      asrWordMatch?: number;
      qualityAfter?: AlignmentQuality;
      qualityBefore?: AlignmentQuality;
      requireImprovement?: boolean;
    } = {},
  ): Promise<GateDecision> => {
    const before = over.qualityBefore ?? (await qualityBeforeP);
    const qualityAfter = over.qualityAfter ?? (await ports.measureQuality(ctx, transform));
    const confidence = fuseConfidence(evidence, prior);
    return evaluateGate({
      transform,
      confidence,
      qualityBefore: before,
      qualityAfter,
      bounds,
      exactIdentity,
      asrWordMatch: over.asrWordMatch,
      priorRuntimeOk,
      inputAlreadyGood: isAlreadyGood(before, transform),
      requireImprovement: over.requireImprovement,
    });
  };

  const gateSubSwap = async (swap: SwapRef): Promise<PipelineOutcome> => {
    const swapOut = { url: swap.url, format: swap.format };
    const resolved = ports.resolveSwapCues ? await ports.resolveSwapCues(ctx, swap) : null;
    if (!resolved || resolved.cues.length < MIN_SWAP_CUES) {
      const pCorrect = fuseConfidence(evidence, prior).pCorrect;
      const decision: GateDecision = { decision: "offer", reason: "hash-matched subtitle available, swapped timing unverified", bindingRule: "swap-unverified", pCorrect, transform: IDENTITY };
      return { decision, candidate: IDENTITY, subSwap: swapOut, evidence, tiersRun };
    }
    const swapCtx: PipelineContext = { ...ctx, cues: resolved.cues, cueText: resolved.cueText };
    const swapQuality = await ports.measureQuality(swapCtx, IDENTITY);
    const decision = await gateFor(IDENTITY, true, { qualityAfter: swapQuality, requireImprovement: true });
    return { decision, candidate: IDENTITY, subSwap: swapOut, evidence, tiersRun };
  };

  if (ports.hashExact) {
    const h = await ports.hashExact(ctx);
    if (h) {
      tiersRun.push("hash_exact");
      evidence.push(signal("hash_exact", h.rawScore, true, opts));
      let out: PipelineOutcome;
      if (h.subSwap) {
        out = await gateSubSwap(h.subSwap);
      } else {
        const decision = await gateFor(h.transform, true);
        out = { decision, candidate: h.transform, evidence, tiersRun };
      }
      keep(out);
      if (out.decision.decision === "apply") return out;
    }
  }

  if (ports.crowdDb) {
    const c = await ports.crowdDb(ctx);
    if (c && c.verified) {
      tiersRun.push("crowd_db");
      evidence.push(signal("crowd_db", c.rawScore, true, opts, { reliability: crowdReliability(c), crowdTier: c.tier }));
      const decision = await gateFor(c.transform, c.tier === "A");
      const out: PipelineOutcome = { decision, candidate: c.transform, evidence, tiersRun };
      keep(out);
      if (decision.decision === "apply") return out;
    }
  }

  let consensusRes: ConsensusResult | null = null;
  let consensusEvidencePushed = false;
  if (ports.consensus) {
    consensusRes = await consensusP;
    if (consensusRes) {
      tiersRun.push("consensus");
      if (consensusRes.verdict === "wrong") {
        evidence.push(consensusSignal(consensusRes, null));
        const out = wrongContentOutcome(consensusRes, fuseConfidence(evidence, prior).pCorrect, evidence, tiersRun);
        keep(out);
        if (!opts.tryHarder) return out;
      }
    }
  }

  if (consensusRes && consensusRes.verdict === "right") {
    const fastFit = consensusAnchorFit(consensusRes);
    if (fastFit) {
      const fastT: SyncTransform = { kind: "affine", offsetSec: fastFit.offsetSec, ratio: fastFit.ratio };
      evidence.push(consensusSignal(consensusRes, fastT));
      consensusEvidencePushed = true;
      const fastAfter = await ports.measureQuality(ctx, fastT);
      let decision = await gateFor(fastT, false, { qualityAfter: fastAfter });
      let bestEffort = false;
      if (decision.decision !== "apply") {
        const be = evaluateBestEffort({
          transform: fastT,
          confidence: fuseConfidence(evidence, prior),
          qualityBefore: await qualityBeforeP,
          qualityAfter: fastAfter,
          bounds,
          exactIdentity: false,
          inputAlreadyGood: false,
        });
        if (be.decision === "apply") {
          decision = be;
          bestEffort = true;
        }
      }
      if (decision.decision === "apply") {
        const out: PipelineOutcome = { decision, candidate: fastT, evidence, tiersRun, bestEffort };
        keep(out);
        return out;
      }
    }
  }

  let lead: SyncTransform | null = null;
  let leadNcc = 0;
  if (ports.vadAffine) {
    const v = await ports.vadAffine(ctx, windowPolicy(ctx.sourceKind, opts.tryHarder === true));
    if (v) {
      tiersRun.push("vad_affine");
      evidence.push(signal("vad_affine", v.rawScore, v.quality.ncc >= 0.55, opts));
      lead = v.transform;
      leadNcc = v.quality.ncc;
      if (ports.vadPiecewise && needsPiecewise(v)) {
        const p = await ports.vadPiecewise(ctx, v.transform);
        if (p) {
          tiersRun.push("vad_piecewise");
          evidence.push(signal("vad_piecewise", p.rawScore, p.quality.ncc >= 0.55, opts));
          if (p.quality.ncc > v.quality.ncc) {
            lead = p.transform;
            leadNcc = p.quality.ncc;
          }
        }
      }
    }
  }

  if (consensusRes && consensusRes.verdict !== "wrong" && !consensusEvidencePushed) {
    evidence.push(consensusSignal(consensusRes, lead));
  }

  if (ctx.cues.length > 0) {
    tiersRun.push("metadata_prior");
    const sub = subtitleShapeFromCues(ctx.cues, ctx.cueText);
    metaVerdict = classifyContent({
      videoDurationSec: ctx.durationSec,
      sub,
      facts: [],
      wantLangs: ctx.languages,
      ref: ctx.meta ? episodeRefFromMeta(ctx.meta) : undefined,
    });
    evidence.push(metadataEvidence(metaVerdict));
  }

  let asrWordMatch: number | undefined;
  if (lead && ports.asrMatch && shouldRunAsr(evidence, ctx, opts, metaVerdict)) {
    const a = await ports.asrMatch(ctx, lead);
    if (a) {
      tiersRun.push("asr_match");
      asrWordMatch = a.wordMatch;
      evidence.push(signal("asr_match", a.supportsTransform, a.wordMatch >= 0.2, opts, {
        supportsWrong: 1 - a.wordMatch,
      }));
    }
  }

  if (lead) {
    const leadBefore =
      ctx.sourceKind === "torrent" ? await ports.measureQuality(ctx, IDENTITY) : await qualityBeforeP;
    let decision = await gateFor(lead, false, { asrWordMatch, qualityBefore: leadBefore });
    if (metaVerdict?.hardRefuse && decision.decision !== "refuse") {
      const reason = `wrong content: ${metaVerdict.reasons[0] ?? "metadata hard refuse"}`;
      decision = { decision: "refuse", reason, bindingRule: "metadata-hard-refuse", pCorrect: decision.pCorrect, transform: lead };
    }
    keep({ decision, candidate: lead, evidence, tiersRun });
  }

  if (best.decision.decision !== "apply" && !best.subSwap && (opts.tryHarder || !!ports.asrTranscribe)) {
    const esc = await escalateTryHarder({ ctx, ports, lead, leadNcc, consensus: consensusRes, bounds, qualityBefore: await qualityBeforeP, evidence, tiersRun });
    if (esc) keep(esc);
  }

  return best;
}
