'use strict';
/**
 * The cinema programme.
 *
 * Turns a flat list of add-on metas into something that reads like a real
 * auditorium schedule: what is on screen now, what opens soon, which
 * auditorium each film sits in, and when the next house opens. Everything is
 * derived deterministically from the film's id, so the board is stable across
 * restarts instead of reshuffling every launch.
 */

const DEFAULT_SCHEDULE = {
  screens: 8,
  firstShow: '11:30',
  lastShow: '23:45',
  slotMinutes: 45,
  minutesBetweenShows: 150,
};

/** Stable 32-bit hash — our source of deterministic "randomness". */
function hash(str) {
  let h = 2166136261 >>> 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function pick(list, seed) {
  if (!list || !list.length) return undefined;
  return list[hash(seed) % list.length];
}

function parseClock(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToDate(baseDate, minutes) {
  const d = new Date(baseDate);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

/** Runtime in whole minutes, from the many strings add-ons use ("2h 8min", "128 min"). */
function runtimeMinutes(meta) {
  const raw = String((meta && meta.runtime) || '');
  if (!raw) return 0;
  const hours = raw.match(/(\d+)\s*h/i);
  const mins = raw.match(/(\d+)\s*m/i);
  if (hours || mins) return (hours ? Number(hours[1]) * 60 : 0) + (mins ? Number(mins[1]) : 0);
  const plain = raw.match(/\d+/);
  return plain ? Number(plain[0]) : 0;
}

/** Age rating — real value when the add-on has one, otherwise a plausible stand-in. */
function certificationOf(meta) {
  if (meta && meta.certification) return String(meta.certification).toUpperCase();
  return pick(['G', 'PG', 'PG-13', 'PG-13', 'R', '12', '15'], `cert:${meta && meta.id}`);
}

/**
 * Split a catalog into what is playing now versus what opens soon.
 * A film counts as "coming soon" when its release date is still ahead of us,
 * or when it carries no date at all but is stamped with next year.
 */
function splitProgram(metas, now = new Date()) {
  const nowShowing = [];
  const comingSoon = [];
  const thisYear = now.getFullYear();

  for (const meta of metas || []) {
    if (!meta || !meta.id) continue;
    const released = meta.released ? new Date(meta.released) : null;
    const validDate = released && !Number.isNaN(released.getTime());
    if (validDate) {
      (released > now ? comingSoon : nowShowing).push(meta);
    } else if (meta.year && meta.year > thisYear) {
      comingSoon.push(meta);
    } else {
      nowShowing.push(meta);
    }
  }
  return { nowShowing, comingSoon };
}

/**
 * Give each film an auditorium, a format and a run of showtimes for the day.
 * @returns {Array<{meta:object, screen:number, format:string, showtimes:Date[], certification:string}>}
 */
function buildSchedule(metas, opts = {}) {
  const cfg = { ...DEFAULT_SCHEDULE, ...(opts.schedule || {}) };
  const now = opts.now || new Date();
  const formats = opts.formats || ['2D', 'IMAX', 'Dolby Atmos', '4DX', 'VIP', 'Premium'];

  const first = parseClock(cfg.firstShow);
  const last = parseClock(cfg.lastShow);

  return (metas || []).map((meta, index) => {
    const seed = hash(meta.id);
    const screen = (index % Math.max(1, cfg.screens)) + 1;
    // Stagger each screen so the board never shows every house opening at once.
    const offset = (seed % Math.max(1, Math.floor(cfg.minutesBetweenShows / cfg.slotMinutes))) * cfg.slotMinutes;

    const showtimes = [];
    for (let t = first + offset; t <= last; t += cfg.minutesBetweenShows) {
      showtimes.push(minutesToDate(now, t));
    }

    return {
      meta,
      screen,
      format: formats[seed % formats.length],
      certification: certificationOf(meta),
      runtime: runtimeMinutes(meta),
      showtimes,
    };
  });
}

/** The next house to open for this film — rolling over to tomorrow after the last show. */
function nextShowtime(session, now = new Date()) {
  if (!session || !session.showtimes || !session.showtimes.length) return null;
  const upcoming = session.showtimes.find((t) => t.getTime() > now.getTime());
  if (upcoming) return upcoming;
  const tomorrow = new Date(session.showtimes[0]);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

/** "starts in 12 min" / "بعد ١٢ دقيقة" — minutes until the next house opens. */
function minutesUntil(date, now = new Date()) {
  if (!date) return null;
  return Math.max(0, Math.round((date.getTime() - now.getTime()) / 60000));
}

/**
 * Build the lobby reel: the sequence of trailers the attract loop cycles through.
 * Coming-soon titles lead, because that is what a real lobby screen pushes.
 */
function buildReel({ comingSoon = [], nowShowing = [], limit = 12 } = {}) {
  const withTrailer = (list) => list.filter((m) => m && m.trailers && m.trailers.length);
  const soon = withTrailer(comingSoon);
  const now = withTrailer(nowShowing);
  const reel = [];
  let i = 0;
  // Two upcoming for every one currently showing.
  while (reel.length < limit && (i < soon.length || i < now.length)) {
    if (soon[i * 2]) reel.push({ meta: soon[i * 2], kind: 'coming-soon' });
    if (soon[i * 2 + 1]) reel.push({ meta: soon[i * 2 + 1], kind: 'coming-soon' });
    if (now[i]) reel.push({ meta: now[i], kind: 'now-showing' });
    i++;
  }
  return reel.slice(0, limit);
}

/** Auditorium trivia for the lobby board — stable per film. */
function auditoriumInfo(session) {
  const seed = hash(`hall:${session && session.meta && session.meta.id}`);
  return {
    seats: 120 + (seed % 14) * 10,
    sound: pick(['Dolby Atmos', 'DTS:X', 'Dolby 7.1', 'Auro 11.1'], `sound:${session.meta.id}`),
    screen: pick(['Standard', 'Laser', 'IMAX Laser', 'Curved'], `scr:${session.meta.id}`),
  };
}

module.exports = {
  DEFAULT_SCHEDULE,
  hash,
  pick,
  parseClock,
  runtimeMinutes,
  certificationOf,
  splitProgram,
  buildSchedule,
  nextShowtime,
  minutesUntil,
  buildReel,
  auditoriumInfo,
};
