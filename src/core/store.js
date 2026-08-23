'use strict';
/** Tiny JSON-file settings store with defaults and deep-ish merge. */

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  language: 'ar',
  cinemaName: 'CINEMA HALL',
  cinemaNameAr: 'دار العرض',
  // Presentation
  //   auto   — cinema mode switches itself on whenever a television is connected
  //   always — cinema mode regardless of what is plugged in
  //   off    — an ordinary window
  cinemaMode: 'auto',
  announceTv: true, // show a notice on the screen when the TV is picked up
  displayIndex: null, // null = auto (prefer the external screen, i.e. the TV)
  overscanPercent: 2.5, // TVs crop the edges; keep the UI inside the safe area
  hideCursor: true,
  clock24h: false,
  launchAtLogin: false,
  // Attract loop / lobby
  attractEnabled: true,
  idleSecondsToAttract: 180,
  attractSlideSeconds: 18,
  attractPlayTrailers: true,
  attractMuted: true,
  // Pre-show before the feature
  preshowEnabled: true,
  preshowTrailers: 2,
  preshowBumpers: true,
  preshowCountdown: true,
  // Playback
  //   auto — mpv when it is installed, the built-in web player otherwise
  playerEngine: 'auto',
  mpvPath: null, // an explicit mpv binary, when it lives somewhere unusual
  autoUpdate: true,
  // Sources
  addons: ['https://v3-cinemeta.strem.io/manifest.json'],
  streamingServerUrl: 'http://127.0.0.1:11470',
  authKey: null,
  account: null,
  schedule: {
    screens: 8,
    firstShow: '11:30',
    lastShow: '23:45',
    slotMinutes: 45,
    minutesBetweenShows: 150,
  },
};

class Store {
  constructor(filePath, defaults = DEFAULTS) {
    this.filePath = filePath;
    this.defaults = defaults;
    this.data = this._read();
  }

  _read() {
    try {
      const raw = fs.readFileSync(this.filePath, 'utf8');
      return merge(structuredClone(this.defaults), JSON.parse(raw));
    } catch {
      return structuredClone(this.defaults);
    }
  }

  get(key) {
    return key === undefined ? this.data : this.data[key];
  }

  set(patch) {
    this.data = merge(this.data, patch || {});
    this.save();
    return this.data;
  }

  reset() {
    this.data = structuredClone(this.defaults);
    this.save();
    return this.data;
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
  }
}

function merge(target, patch) {
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = merge(target[key] && typeof target[key] === 'object' ? target[key] : {}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

module.exports = { Store, DEFAULTS, merge };
