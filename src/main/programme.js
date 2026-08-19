'use strict';
/**
 * Assembles the house programme for the renderer.
 *
 * Pulls catalogs from every installed add-on, splits them into now-showing and
 * coming-soon, builds the schedule, and falls back to the offline demo house
 * whenever the add-ons are unreachable — the screen is never blank.
 */

const { AddonClient } = require('../core/addons');
const program = require('../core/program');
const { demoCatalog } = require('../core/demo');
const stremioApi = require('../core/stremio-api');

const PROGRAMME_TTL = 30 * 60 * 1000;

class Programme {
  constructor(store) {
    this.store = store;
    this.client = new AddonClient();
    this.loadedAt = 0;
    this.cache = null;
    this.lastError = null;
    this.usingDemo = false;
  }

  /** (Re)load the add-on set: account collection when signed in, else the configured list. */
  async refreshAddons() {
    const cfg = this.store.get();
    let failed = [];

    if (cfg.authKey) {
      try {
        const collection = await stremioApi.getAddonCollection(cfg.authKey);
        if (collection.length) {
          this.client.useAddons(collection);
          return { count: collection.length, source: 'account', failed };
        }
      } catch (err) {
        this.lastError = `account sync failed: ${err.message}`;
      }
    }

    const result = await this.client.setAddons(cfg.addons || []);
    failed = result.failed;
    return { count: result.ok.length, source: 'local', failed };
  }

  /** Pull a decent spread of movies from whichever catalogs the add-ons expose. */
  async fetchMetas(type = 'movie') {
    const catalogs = this.client.catalogs(type);
    if (!catalogs.length) return [];

    // Prefer the catalogs a cinema cares about: popular and newly released.
    const ranked = [...catalogs].sort((a, b) => catalogRank(a) - catalogRank(b)).slice(0, 6);
    const pages = await Promise.allSettled(ranked.map((ref) => this.client.getCatalog(ref)));

    const seen = new Set();
    const metas = [];
    for (const page of pages) {
      if (page.status !== 'fulfilled') continue;
      for (const meta of page.value) {
        if (!meta.id || seen.has(meta.id)) continue;
        seen.add(meta.id);
        metas.push(meta);
      }
    }
    return metas;
  }

  /**
   * Enrich the headline titles with full meta so we get trailers, runtime and
   * cast for the lobby reel. Add-on catalogs return only thin records.
   */
  async enrich(metas, limit = 14) {
    const targets = metas.slice(0, limit);
    const full = await Promise.allSettled(targets.map((m) => this.client.getMeta(m.type, m.id)));
    return metas.map((meta, i) => {
      if (i >= targets.length) return meta;
      const r = full[i];
      return r.status === 'fulfilled' && r.value ? { ...meta, ...r.value } : meta;
    });
  }

  async load({ force = false } = {}) {
    if (!force && this.cache && Date.now() - this.loadedAt < PROGRAMME_TTL) return this.cache;

    const now = new Date();
    let metas = [];
    this.usingDemo = false;
    this.lastError = null;

    try {
      await this.refreshAddons();
      metas = await this.fetchMetas('movie');
      if (metas.length) metas = await this.enrich(metas);
    } catch (err) {
      this.lastError = err.message;
    }

    if (!metas.length) {
      metas = demoCatalog();
      this.usingDemo = true;
    }

    const { nowShowing, comingSoon } = program.splitProgram(metas, now);
    const schedule = program.buildSchedule(nowShowing, {
      now,
      schedule: this.store.get('schedule'),
    });
    const soonSchedule = comingSoon.map((meta) => ({
      meta,
      certification: program.certificationOf(meta),
      runtime: program.runtimeMinutes(meta),
      opensOn: meta.released || null,
    }));

    this.cache = {
      generatedAt: now.toISOString(),
      usingDemo: this.usingDemo,
      lastError: this.lastError,
      addonCount: this.client.addons.length,
      nowShowing: schedule.map(serialiseSession),
      comingSoon: soonSchedule,
      reel: program.buildReel({ comingSoon, nowShowing, limit: 12 }),
    };
    this.loadedAt = Date.now();
    return this.cache;
  }
}

/** Dates don't survive IPC structured-clone predictably across all versions — send ISO strings. */
function serialiseSession(session) {
  return {
    meta: session.meta,
    screen: session.screen,
    format: session.format,
    certification: session.certification,
    runtime: session.runtime,
    showtimes: session.showtimes.map((d) => d.toISOString()),
    hall: program.auditoriumInfo(session),
  };
}

function catalogRank(catalog) {
  const id = String(catalog.id).toLowerCase();
  if (id.includes('top') || id.includes('popular') || id.includes('trending')) return 0;
  if (id.includes('year') || id.includes('new') || id.includes('recent')) return 1;
  if (id.includes('featured')) return 2;
  return 5;
}

module.exports = { Programme, serialiseSession };
