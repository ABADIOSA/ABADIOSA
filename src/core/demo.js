'use strict';
/**
 * Offline house programme.
 *
 * Cinema Hall must look like a working cinema the second it is switched on —
 * before any add-on has answered, and even with the network unplugged. These
 * are invented titles with procedurally drawn artwork, so nothing here depends
 * on a remote catalogue or borrows anyone's poster.
 */

const PALETTES = [
  ['#1b1035', '#5b1e63', '#c2410c'],
  ['#04202b', '#0d5c63', '#e0a82e'],
  ['#2b0a0a', '#7f1d1d', '#f59e0b'],
  ['#0b1020', '#1e3a8a', '#22d3ee'],
  ['#150f24', '#4c1d95', '#f472b6'],
  ['#0a1a12', '#14532d', '#a3e635'],
  ['#1a1206', '#78350f', '#fbbf24'],
  ['#12071a', '#3b0764', '#8b5cf6'],
];

function svgDataUri(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s+/g, ' ').trim())}`;
}

/** A poster drawn from the title itself: gradient wash, grain, big initials. */
function posterFor(title, seed, w = 500, h = 750) {
  const [a, b, c] = PALETTES[seed % PALETTES.length];
  // Only real words contribute initials — a stray "&" would break the SVG.
  const initials = title
    .split(/\s+/)
    .filter((word) => /^[\p{L}\p{N}]/u.test(word))
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stop-color="${a}"/>
          <stop offset="55%" stop-color="${b}"/>
          <stop offset="100%" stop-color="${c}"/>
        </linearGradient>
        <radialGradient id="v" cx="50%" cy="35%" r="75%">
          <stop offset="55%" stop-color="rgba(0,0,0,0)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0.75)"/>
        </radialGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#g)"/>
      <g opacity="0.20" fill="none" stroke="#fff" stroke-width="1.2">
        ${Array.from({ length: 9 }, (_, i) => `<circle cx="${w / 2}" cy="${h * 0.36}" r="${40 + i * 34}"/>`).join('')}
      </g>
      <rect width="${w}" height="${h}" fill="url(#v)"/>
      <text x="50%" y="40%" text-anchor="middle" font-family="Georgia, serif" font-size="${w * 0.34}"
            fill="rgba(255,255,255,0.92)" letter-spacing="6">${escapeXml(initials)}</text>
      <text x="50%" y="86%" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
            font-size="${w * 0.055}" fill="rgba(255,255,255,0.86)" letter-spacing="3">
        ${escapeXml(title.toUpperCase().slice(0, 26))}
      </text>
    </svg>`);
}

function backdropFor(title, seed, w = 1920, h = 1080) {
  const [a, b, c] = PALETTES[seed % PALETTES.length];
  return svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${a}"/>
          <stop offset="60%" stop-color="${b}"/>
          <stop offset="100%" stop-color="${c}"/>
        </linearGradient>
      </defs>
      <rect width="${w}" height="${h}" fill="url(#bg)"/>
      <g opacity="0.16" stroke="#fff" stroke-width="2" fill="none">
        ${Array.from({ length: 14 }, (_, i) => `<path d="M0 ${i * 90} Q ${w / 2} ${i * 90 - 160} ${w} ${i * 90}"/>`).join('')}
      </g>
      <rect width="${w}" height="${h}" fill="rgba(0,0,0,0.35)"/>
    </svg>`);
}

function escapeXml(str) {
  return String(str).replace(/[<>&'"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[ch]));
}

const TITLES = [
  ['The Lantern Coast', 'A lighthouse keeper answers a signal that stopped transmitting forty years ago.', 'Drama,Mystery', '1h 58min', '8.1'],
  ['Nightfall Orbit', 'The last maintenance crew of a decaying station discovers the ground crew stopped answering weeks ago.', 'Sci-Fi,Thriller', '2h 12min', '7.8'],
  ['Salt & Cedar', 'Two estranged sisters drive a failing olive harvest to market across a closing border.', 'Drama', '1h 44min', '7.6'],
  ['The Quiet Ledger', 'A small-town accountant finds a second set of books and, in it, her own name.', 'Crime,Drama', '2h 04min', '7.9'],
  ['Paper Tigers', 'A retired stunt double is hired for one last fall — from a building that no longer exists.', 'Action,Comedy', '1h 51min', '7.2'],
  ['Monsoon Radio', 'A pirate broadcaster keeps a flooded city talking through the longest night of the year.', 'Drama,Music', '2h 09min', '8.3'],
  ['Glasshouse Kings', 'Rival botanists race to bloom a flower that opens once a century.', 'Drama,Romance', '1h 47min', '7.4'],
  ['The Understudy', 'On opening night the lead vanishes, and the understudy realises she wrote the play.', 'Thriller', '1h 39min', '7.7'],
  ['Iron Harvest Road', 'A convoy driver hauls cargo she was told never to look at.', 'Action,Thriller', '2h 16min', '7.5'],
  ['Cold Open', 'A live sketch show refuses to cut to break while the studio is being evacuated.', 'Comedy', '1h 36min', '7.1'],
  ['Wolves of the Blue Hour', 'A tracker and a poacher are snowed into the same cabin for six days.', 'Drama,Adventure', '2h 01min', '8.0'],
  ['Signal to Noise', 'A sound engineer hears a confession buried under thirty years of tape hiss.', 'Mystery', '1h 55min', '7.9'],
];

const SOON = [
  ['Ash Cartography', 'A mapmaker charts a volcano that keeps redrawing the coastline beneath her.', 'Adventure,Drama', '2h 07min', ''],
  ['The Ninth Reel', 'A projectionist finds a film that was never shot.', 'Horror,Mystery', '1h 42min', ''],
  ['Gravity Well', 'Two rescue pilots have one tank of fuel and three people to bring home.', 'Sci-Fi,Action', '2h 21min', ''],
  ['Little Empires', 'A twelve-year-old runs the family restaurant for one impossible summer.', 'Comedy,Drama', '1h 49min', ''],
  ['Undertow Season', 'A coastal town votes on whether to move — or to stay and be moved.', 'Drama', '2h 03min', ''],
  ['The Long Interval', 'An orchestra plays on after the audience has gone.', 'Drama,Music', '1h 58min', ''],
];

function buildMeta(entry, index, { comingSoon }) {
  const [name, description, genres, runtime, rating] = entry;
  const seed = index * 7 + (comingSoon ? 3 : 0) + name.length;
  const year = comingSoon ? new Date().getFullYear() + 1 : new Date().getFullYear();
  const released = comingSoon
    ? new Date(Date.now() + (21 + index * 24) * 86400000).toISOString()
    : new Date(Date.now() - (7 + index * 11) * 86400000).toISOString();

  return {
    id: `demo:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    type: 'movie',
    name,
    description,
    poster: posterFor(name, seed),
    background: backdropFor(name, seed),
    logo: '',
    genres: genres.split(','),
    runtime,
    imdbRating: rating,
    year,
    releaseInfo: String(year),
    released,
    cast: [],
    director: [],
    trailers: [],
    videos: [],
    certification: '',
    demo: true,
  };
}

/** The full stand-in programme used before (or instead of) live add-on data. */
function demoCatalog() {
  return [
    ...TITLES.map((t, i) => buildMeta(t, i, { comingSoon: false })),
    ...SOON.map((t, i) => buildMeta(t, i, { comingSoon: true })),
  ];
}

module.exports = { demoCatalog, posterFor, backdropFor, svgDataUri, PALETTES };
