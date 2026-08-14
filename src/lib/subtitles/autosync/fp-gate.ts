import type { FusedConfidence } from "./confidence";

export type AffineTransform = { kind: "affine"; offsetSec: number; ratio: number };
export type PiecewiseSegment = {
  fromSec: number;
  toSec: number;
  offsetSec: number;
  ratio: number;
};
export type PiecewiseTransform = { kind: "piecewise"; segments: PiecewiseSegment[] };
export type SyncTransform = AffineTransform | PiecewiseTransform;

export type AlignmentQuality = { ncc: number; coverage: number; z: number };

export type Bounds = {
  maxOffsetSec: number;
  hardOffsetCapSec: number;
  maxFramerateDev: number;
  knownRatios: number[];
  ratioSnapTol: number;
};

export type GateInputs = {
  transform: SyncTransform;
  confidence: FusedConfidence;
  qualityBefore: AlignmentQuality;
  qualityAfter: AlignmentQuality;
  bounds: Bounds;
  exactIdentity: boolean;
  asrWordMatch?: number;
  priorRuntimeOk?: boolean;
  inputAlreadyGood: boolean;
  requireImprovement?: boolean;
};

export type Outcome = "refuse" | "offer" | "apply";

export type GateDecision = {
  decision: Outcome;
  reason: string;
  pCorrect: number;
  transform: SyncTransform;
  bindingRule: string;
};

export const DEFAULT_BOUNDS: Bounds = {
  maxOffsetSec: 30,
  hardOffsetCapSec: 60,
  maxFramerateDev: 0.1,
  knownRatios: [
    1,
    25 / 24,
    24 / 25,
    25 / 23.976,
    23.976 / 25,
    24 / 23.976,
    23.976 / 24,
    30 / 29.97,
    29.97 / 30,
  ],
  ratioSnapTol: 0.0015,
};

export const THRESHOLDS = {
  applyExact: 0.97,
  applyMulti: 0.9,
  offerFloor: 0.65,
  minImprovement: 0.08,
  exactSlack: 0.05,
  minAbsoluteNcc: 0.55,
  minCoverage: 0.6,
  exactMinCoverage: 0.4,
  wrongContentFloor: 0.2,
  maxConflict: 0.35,
  hardConflict: 0.6,
  alreadyGoodNcc: 0.85,
};

const RANK: Record<Outcome, number> = { refuse: 0, offer: 1, apply: 2 };

type Rule = { name: string; ceiling: Outcome; reason: string };

function segmentsOf(t: SyncTransform): PiecewiseSegment[] {
  if (t.kind === "affine") {
    return [{ fromSec: 0, toSec: Infinity, offsetSec: t.offsetSec, ratio: t.ratio }];
  }
  return t.segments;
}

function snapsToKnownRatio(ratio: number, b: Bounds): boolean {
  return b.knownRatios.some((r) => Math.abs(ratio - r) <= b.ratioSnapTol);
}

function promotionCeiling(inp: GateInputs): Rule {
  const p = inp.confidence.pCorrect;
  if (inp.exactIdentity && p >= THRESHOLDS.applyExact) {
    return { name: "promotion", ceiling: "apply", reason: "exact-identity, high calibrated confidence" };
  }
  if (inp.confidence.agreeingSignals >= 2 && p >= THRESHOLDS.applyMulti) {
    return { name: "promotion", ceiling: "apply", reason: "two independent signals agree" };
  }
  if (p >= THRESHOLDS.offerFloor) {
    return { name: "promotion", ceiling: "offer", reason: "single-signal moderate confidence" };
  }
  return { name: "promotion", ceiling: "refuse", reason: "confidence below offer floor" };
}

function boundedSearchVeto(inp: GateInputs): Rule {
  const b = inp.bounds;
  let ceiling: Outcome = "apply";
  let reason = "within physical bounds";
  for (const seg of segmentsOf(inp.transform)) {
    const off = Math.abs(seg.offsetSec);
    if (off > b.hardOffsetCapSec) {
      return { name: "bounded-search", ceiling: "refuse", reason: `offset ${seg.offsetSec.toFixed(1)}s exceeds hard cap` };
    }
    const dev = Math.abs(seg.ratio - 1);
    if (dev > b.maxFramerateDev && !snapsToKnownRatio(seg.ratio, b)) {
      return { name: "bounded-search", ceiling: "refuse", reason: `ratio ${seg.ratio.toFixed(4)} off physical fps grid` };
    }
    if (off > b.maxOffsetSec) {
      if (!inp.exactIdentity) {
        return { name: "bounded-search", ceiling: "refuse", reason: `offset ${seg.offsetSec.toFixed(1)}s beyond plausible range` };
      }
      ceiling = "offer";
      reason = "large offset on exact match, confirm before applying";
    }
  }
  return { name: "bounded-search", ceiling, reason };
}

function neverWorseVeto(inp: GateInputs): Rule {
  const before = inp.qualityBefore.ncc;
  const after = inp.qualityAfter.ncc;
  if (after < THRESHOLDS.minAbsoluteNcc) {
    return { name: "never-worse", ceiling: "refuse", reason: `post-sync ncc ${after.toFixed(2)} below absolute floor` };
  }
  const lenient = inp.exactIdentity && !inp.requireImprovement;
  const need = lenient ? -THRESHOLDS.exactSlack : THRESHOLDS.minImprovement;
  const delta = after - before;
  if (delta < need) {
    if (lenient && delta >= -THRESHOLDS.exactSlack * 2) {
      return { name: "never-worse", ceiling: "offer", reason: "exact match shows no clear improvement" };
    }
    if (inp.requireImprovement && delta >= -THRESHOLDS.exactSlack) {
      return { name: "never-worse", ceiling: "offer", reason: "swapped subtitle not clearly better than input" };
    }
    return { name: "never-worse", ceiling: "refuse", reason: `not better than input (delta ncc ${delta.toFixed(2)})` };
  }
  return { name: "never-worse", ceiling: "apply", reason: "clearly better than input" };
}

function classCVeto(inp: GateInputs): Rule {
  if (inp.asrWordMatch === undefined) {
    return { name: "class-c", ceiling: "apply", reason: "asr verification not run" };
  }
  if (inp.asrWordMatch < THRESHOLDS.wrongContentFloor) {
    return { name: "class-c", ceiling: "refuse", reason: `wrong content: asr word-match ${(inp.asrWordMatch * 100).toFixed(0)}%` };
  }
  return { name: "class-c", ceiling: "apply", reason: "spoken words match subtitle text" };
}

function coverageVeto(inp: GateInputs): Rule {
  const floor = inp.exactIdentity && !inp.requireImprovement ? THRESHOLDS.exactMinCoverage : THRESHOLDS.minCoverage;
  if (inp.qualityAfter.coverage < floor) {
    return { name: "coverage", ceiling: "refuse", reason: `cue-on-speech coverage ${(inp.qualityAfter.coverage * 100).toFixed(0)}% too low` };
  }
  return { name: "coverage", ceiling: "apply", reason: "cues land on speech" };
}

function conflictVeto(inp: GateInputs): Rule {
  const k = inp.confidence.conflictK;
  if (k > THRESHOLDS.hardConflict) {
    return { name: "conflict", ceiling: "refuse", reason: `signals in hard conflict (K=${k.toFixed(2)})` };
  }
  if (k > THRESHOLDS.maxConflict) {
    return { name: "conflict", ceiling: "offer", reason: `independent signals disagree (K=${k.toFixed(2)})` };
  }
  return { name: "conflict", ceiling: "apply", reason: "signals coherent" };
}

function alreadyGoodVeto(inp: GateInputs): Rule {
  if (!inp.inputAlreadyGood) {
    return { name: "already-good", ceiling: "apply", reason: "input needs correction" };
  }
  if (inp.exactIdentity) {
    return { name: "already-good", ceiling: "offer", reason: "input already good, exact swap optional" };
  }
  return { name: "already-good", ceiling: "refuse", reason: "input already well aligned, leaving untouched" };
}

function runtimeVeto(inp: GateInputs): Rule {
  if (inp.priorRuntimeOk === false) {
    return { name: "runtime-prior", ceiling: "offer", reason: "duration disagrees with expected runtime, confirm" };
  }
  return { name: "runtime-prior", ceiling: "apply", reason: "runtime prior consistent" };
}

export function evaluateGate(inp: GateInputs): GateDecision {
  const rules: Rule[] = [
    promotionCeiling(inp),
    boundedSearchVeto(inp),
    neverWorseVeto(inp),
    classCVeto(inp),
    coverageVeto(inp),
    conflictVeto(inp),
    alreadyGoodVeto(inp),
    runtimeVeto(inp),
  ];

  let decision: Outcome = "apply";
  let reason = "clear to apply";
  let bindingRule = "default";
  for (const r of rules) {
    if (RANK[r.ceiling] < RANK[decision]) {
      decision = r.ceiling;
      reason = r.reason;
      bindingRule = r.name;
    }
  }

  return { decision, reason, bindingRule, pCorrect: inp.confidence.pCorrect, transform: inp.transform };
}

export function outcomeRank(o: Outcome): number {
  return RANK[o];
}

export function evaluateBestEffort(inp: GateInputs): GateDecision {
  const bounded = boundedSearchVeto(inp);
  const base = { pCorrect: inp.confidence.pCorrect, transform: inp.transform };
  if (bounded.ceiling === "refuse") {
    return { decision: "refuse", reason: bounded.reason, bindingRule: "best-effort-bounds", ...base };
  }
  const delta = inp.qualityAfter.ncc - inp.qualityBefore.ncc;
  if (inp.qualityAfter.ncc < THRESHOLDS.wrongContentFloor && delta < -THRESHOLDS.minImprovement) {
    return { decision: "refuse", reason: "best guess does not fit the audio, go manual", bindingRule: "best-effort-nofit", ...base };
  }
  return { decision: "apply", reason: "best-effort estimate applied", bindingRule: "best-effort", ...base };
}
