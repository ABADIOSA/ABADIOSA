'use strict';
/**
 * Stremio add-on protocol (v3) client.
 *
 * Pure Node: no Electron imports, so it can be unit-tested with `node --test`.
 * Protocol reference — every add-on is just a static-ish HTTP endpoint:
 *   {base}/manifest.json
 *   {base}/{resource}/{type}/{id}.json
 *   {base}/{resource}/{type}/{id}/{k1}={v1}&{k2}={v2}.json
 */

const DEFAULT_TIMEOUT = 12000;

/** Strip the trailing /manifest.json (and any trailing slash) off a transport URL. */
function baseUrlOf(transportUrl) {
  if (!transportUrl) return '';
  return String(transportUrl).replace(/\/manifest\.json.*$/i, '').replace(/\/+$/, '');
}

function manifestUrlOf(url) {
  const base = baseUrlOf(url);
  return base ? `${base}/manifest.json` : '';
}

/** Build a resource URL following the add-on routing rules. */
function resourceUrl(transportUrl, resource, type, id, extra) {
  const base = baseUrlOf(transportUrl);
  let url = `${base}/${encodeURIComponent(resource)}/${encodeURIComponent(type)}/${encodeURIComponent(id)}`;
  const pairs = Object.entries(extra || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  if (pairs.length) url += `/${pairs.join('&')}`;
  return `${url}.json`;
}

/** Normalise manifest.resources into [{name, types, idPrefixes}]. */
function normaliseResources(manifest) {
  const list = Array.isArray(manifest && manifest.resources) ? manifest.resources : [];
  return list.map((r) =>
    typeof r === 'string'
      ? { name: r, types: manifest.types || [], idPrefixes: manifest.idPrefixes || null }
      : {
          name: r.name,
          types: r.types || manifest.types || [],
          idPrefixes: r.idPrefixes || manifest.idPrefixes || null,
        }
  );
}

/** Can this add-on answer `resource` for `type`/`id`? */
function supports(manifest, resource, type, id) {
  if (!manifest) return false;
  const entry = normaliseResources(manifest).find((r) => r.name === resource);
  if (!entry) return false;
  if (type && Array.isArray(entry.types) && entry.types.length && !entry.types.includes(type)) return false;
  if (id && Array.isArray(entry.idPrefixes) && entry.idPrefixes.length) {
    if (!entry.idPrefixes.some((p) => String(id).startsWith(p))) return false;
  }
  return true;
}

/** Which extra props does a catalog accept? Handles both v3 shapes. */
function catalogExtras(catalog) {
  if (!catalog) return { supported: [], required: [] };
  if (Array.isArray(catalog.extra)) {
    return {
      supported: catalog.extra.map((e) => e.name),
      required: catalog.extra.filter((e) => e.isRequired).map((e) => e.name),
      options: Object.fromEntries(catalog.extra.map((e) => [e.name, e.options || []])),
    };
  }
  return {
    supported: catalog.extraSupported || [],
    required: catalog.extraRequired || [],
    options: {},
  };
}

/** A catalog usable for plain browsing = nothing mandatory beyond skip/genre. */
function isBrowsable(catalog) {
  const { required } = catalogExtras(catalog);
  return !required.some((name) => name !== 'skip' && name !== 'genre');
}

function isSearchable(catalog) {
  return catalogExtras(catalog).supported.includes('search');
}

async function getJson(url, { timeout = DEFAULT_TIMEOUT, signal } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeout);
  const onAbort = () => ctrl.abort(signal.reason);
  if (signal) signal.addEventListener('abort', onAbort, { once: true });
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { accept: 'application/json', 'user-agent': 'CinemaHall/1.0 (Stremio add-on client)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener('abort', onAbort);
  }
}

class AddonClient {
  /**
   * @param {{fetchJson?: Function, ttlMs?: number}} [opts] - fetchJson is injectable for tests.
   */
  constructor(opts = {}) {
    this.fetchJson = opts.fetchJson || getJson;
    this.ttlMs = opts.ttlMs ?? 10 * 60 * 1000;
    /** @type {Array<{transportUrl:string, manifest:object}>} */
    this.addons = [];
    this._cache = new Map();
  }

  _cached(key, producer) {
    const hit = this._cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const value = Promise.resolve(producer()).catch((err) => {
      this._cache.delete(key);
      throw err;
    });
    this._cache.set(key, { value, expires: Date.now() + this.ttlMs });
    return value;
  }

  clearCache() {
    this._cache.clear();
  }

  /** Load a manifest and return {transportUrl, manifest}. */
  async loadAddon(transportUrl) {
    const url = manifestUrlOf(transportUrl);
    if (!url) throw new Error('empty transport url');
    const manifest = await this.fetchJson(url);
    if (!manifest || !manifest.id) throw new Error(`not a Stremio add-on: ${url}`);
    return { transportUrl: url, manifest };
  }

  /**
   * Replace the installed set. Bad add-ons are skipped, never fatal.
   * @returns {Promise<{ok: Array, failed: Array<{transportUrl:string, error:string}>}>}
   */
  async setAddons(transportUrls) {
    const results = await Promise.allSettled((transportUrls || []).map((u) => this.loadAddon(u)));
    const ok = [];
    const failed = [];
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') ok.push(r.value);
      else failed.push({ transportUrl: transportUrls[i], error: String(r.reason && r.reason.message || r.reason) });
    });
    this.addons = ok;
    this.clearCache();
    return { ok, failed };
  }

  /** Adopt already-resolved manifests (e.g. from a Stremio account sync). */
  useAddons(addons) {
    this.addons = (addons || []).filter((a) => a && a.manifest && a.manifest.id);
    this.clearCache();
    return this.addons;
  }

  addonsFor(resource, type, id) {
    return this.addons.filter((a) => supports(a.manifest, resource, type, id));
  }

  /** Every browsable catalog across every installed add-on. */
  catalogs(type) {
    const out = [];
    for (const addon of this.addons) {
      if (!supports(addon.manifest, 'catalog', type)) continue;
      for (const catalog of addon.manifest.catalogs || []) {
        if (type && catalog.type !== type) continue;
        if (!isBrowsable(catalog)) continue;
        out.push({
          addon: addon.transportUrl,
          addonName: addon.manifest.name,
          id: catalog.id,
          type: catalog.type,
          name: catalog.name || catalog.id,
          genres: catalogExtras(catalog).options.genre || catalog.genres || [],
          key: `${addon.manifest.id}|${catalog.type}|${catalog.id}`,
        });
      }
    }
    return out;
  }

  async getCatalog(catalogRef, extra = {}) {
    const url = resourceUrl(catalogRef.addon, 'catalog', catalogRef.type, catalogRef.id, extra);
    return this._cached(url, async () => {
      const body = await this.fetchJson(url);
      return (body && body.metas ? body.metas : []).map((m) => normaliseMeta(m, catalogRef.type));
    });
  }

  async getMeta(type, id) {
    const providers = this.addonsFor('meta', type, id);
    for (const addon of providers) {
      const url = resourceUrl(addon.transportUrl, 'meta', type, id);
      try {
        const body = await this._cached(url, () => this.fetchJson(url));
        if (body && body.meta) return normaliseMeta(body.meta, type);
      } catch {
        /* try the next provider */
      }
    }
    return null;
  }

  /** Fan out to every stream provider; merge, tagging each stream with its source. */
  async getStreams(type, id) {
    const providers = this.addonsFor('stream', type, id);
    const results = await Promise.allSettled(
      providers.map(async (addon) => {
        const url = resourceUrl(addon.transportUrl, 'stream', type, id);
        const body = await this.fetchJson(url, { timeout: 20000 });
        return (body && body.streams ? body.streams : []).map((s) => ({
          ...s,
          addonName: addon.manifest.name,
          addonId: addon.manifest.id,
        }));
      })
    );
    return results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
  }

  /** Search every searchable catalog of `type`. Deduplicated by meta id. */
  async search(type, query) {
    const targets = [];
    for (const addon of this.addons) {
      if (!supports(addon.manifest, 'catalog', type)) continue;
      for (const catalog of addon.manifest.catalogs || []) {
        if (catalog.type !== type || !isSearchable(catalog)) continue;
        targets.push({ addon: addon.transportUrl, id: catalog.id, type: catalog.type });
      }
    }
    const results = await Promise.allSettled(targets.map((t) => this.getCatalog(t, { search: query })));
    const seen = new Set();
    const out = [];
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      for (const meta of r.value) {
        if (seen.has(meta.id)) continue;
        seen.add(meta.id);
        out.push(meta);
      }
    }
    return out;
  }
}

/** Flatten the several shapes add-ons use into one predictable meta object. */
function normaliseMeta(meta, fallbackType) {
  const trailers = [];
  for (const t of meta.trailerStreams || []) if (t && t.ytId) trailers.push({ ytId: t.ytId, title: t.title || '' });
  for (const t of meta.trailers || []) {
    const ytId = t && (t.ytId || (t.source && t.type === 'Trailer' ? t.source : null));
    if (ytId && !trailers.some((x) => x.ytId === ytId)) trailers.push({ ytId, title: t.title || '' });
  }
  const year = pickYear(meta);
  return {
    id: meta.id,
    type: meta.type || fallbackType,
    name: meta.name || meta.title || '',
    poster: meta.poster || '',
    background: meta.background || meta.poster || '',
    logo: meta.logo || '',
    description: meta.description || meta.overview || '',
    releaseInfo: meta.releaseInfo || meta.year || '',
    released: meta.released || meta.releaseDate || '',
    year,
    imdbRating: meta.imdbRating != null ? String(meta.imdbRating) : '',
    runtime: meta.runtime || '',
    genres: meta.genres || meta.genre || [],
    cast: meta.cast || [],
    director: meta.director || [],
    country: meta.country || '',
    videos: meta.videos || [],
    trailers,
    certification: meta.certification || meta.contentRating || '',
  };
}

function pickYear(meta) {
  const raw = String(meta.releaseInfo || meta.year || meta.released || '');
  const m = raw.match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : null;
}

module.exports = {
  AddonClient,
  baseUrlOf,
  manifestUrlOf,
  resourceUrl,
  supports,
  normaliseResources,
  catalogExtras,
  isBrowsable,
  isSearchable,
  normaliseMeta,
  getJson,
};
