'use strict';
/**
 * Optional Stremio account bridge.
 *
 * Signing in is never required — Cinema Hall runs on public add-ons out of the
 * box. When the user does sign in we only use the account to pull their
 * installed add-on collection so their catalogs and stream providers carry over.
 */

const API_BASE = 'https://api.strem.io/api';

async function post(path, body, { base = API_BASE, timeout = 15000, fetchImpl = fetch } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeout);
  try {
    const res = await fetchImpl(`${base}/${path}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json && json.error) {
      const err = json.error;
      throw new Error(err.message || err.code || 'Stremio API error');
    }
    return json && json.result !== undefined ? json.result : json;
  } finally {
    clearTimeout(timer);
  }
}

/** @returns {Promise<{authKey:string, user:object}>} */
async function login(email, password, opts) {
  const result = await post('login', { type: 'Login', email, password }, opts);
  if (!result || !result.authKey) throw new Error('login failed: no authKey returned');
  return { authKey: result.authKey, user: result.user || null };
}

/** Anonymous session — lets us read a collection without credentials. */
async function registerAnonymous(opts) {
  const result = await post('register', { type: 'Register', email: '', password: '', gdpr_consent: {} }, opts);
  return { authKey: result && result.authKey, user: (result && result.user) || null };
}

/** @returns {Promise<Array<{transportUrl:string, manifest:object, flags:object}>>} */
async function getAddonCollection(authKey, opts) {
  const result = await post('addonCollectionGet', { type: 'AddonCollectionGet', authKey, update: true }, opts);
  const addons = (result && result.addons) || [];
  return addons
    .filter((a) => a && a.transportUrl && a.manifest)
    .map((a) => ({ transportUrl: a.transportUrl, manifest: a.manifest, flags: a.flags || {} }));
}

async function logout(authKey, opts) {
  try {
    await post('logout', { type: 'Logout', authKey }, opts);
  } catch {
    /* best effort — the local key is cleared regardless */
  }
}

module.exports = { API_BASE, login, logout, registerAnonymous, getAddonCollection, post };
