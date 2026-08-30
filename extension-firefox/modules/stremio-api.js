// modules/stremio-api.js — Stremio API wrapper

const BASE_URL = 'https://api.strem.io/api';

export const StremioAPI = {
  /**
   * تسجيل الدخول — يرجع { authKey, email, id }
   */
  async login(email, password) {
    const res = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, FacebookTkn: '' })
    });
    const data = await res.json();
    if (data.error) {
      const errMsg = typeof data.error === 'string' ? data.error : (data.error.message || 'Login failed');
      throw new Error(errMsg);
    }
    if (data.result?.authKey) {
      return {
        authKey: data.result.authKey,
        email: data.result.email,
        userId: data.result._id || data.result.id
      };
    }
    return null;
  },

  /**
   * جلب المكتبة الكاملة
   */
  async getLibrary(authKey) {
    const res = await fetch(`${BASE_URL}/datastoreGet`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        authKey,
        collection: 'libraryItem',
        ids: [],
        all: true
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data.result || [];
  },

  /**
   * إضافة عمل للمكتبة
   */
  async addToLibrary(authKey, itemMeta) {
    const now = new Date().toISOString();
    const imdbId = itemMeta.imdb_id || itemMeta.id || itemMeta._id;
    const type = itemMeta.type || 'movie';
    const name = itemMeta.name || '';

    const libraryItem = {
      _id: imdbId,
      id: imdbId,
      imdb_id: imdbId,
      name: name,
      type: type,
      poster: itemMeta.poster || '',
      posterShape: 'poster',
      background: itemMeta.background || '',
      logo: itemMeta.logo || '',
      description: itemMeta.description || '',
      releaseInfo: String(itemMeta.releaseInfo || itemMeta.year || ''),
      year: String(itemMeta.year || itemMeta.releaseInfo || ''),
      runtime: String(itemMeta.runtime || ''),
      imdbRating: String(itemMeta.imdbRating || ''),
      genres: Array.isArray(itemMeta.genres) ? itemMeta.genres : (Array.isArray(itemMeta.genre) ? itemMeta.genre : []),
      director: Array.isArray(itemMeta.director) ? itemMeta.director : [],
      cast: Array.isArray(itemMeta.cast) ? itemMeta.cast : [],
      released: itemMeta.released ? String(itemMeta.released) : now,
      slug: itemMeta.slug || `${type}/${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${imdbId}`,
      behaviorHints: {
        defaultVideoId: type === 'movie' ? imdbId : (itemMeta.behaviorHints && itemMeta.behaviorHints.defaultVideoId ? String(itemMeta.behaviorHints.defaultVideoId) : null),
        hasScheduledVideos: itemMeta.behaviorHints ? !!itemMeta.behaviorHints.hasScheduledVideos : false,
      },
      removed: false,
      temp: false,
      _ctime: itemMeta._ctime || now,
      _mtime: itemMeta._mtime || now,
      state: {
        lastWatched: now,
        timeWatched: 0,
        timeOffset: 0,
        overallTimeWatched: 0,
        timesWatched: 0,
        flaggedWatched: 0,
        duration: 0,
        video_id: type === 'movie' ? imdbId : null,
        watched: null,
        noNotif: false,
      }
    };

    if (libraryItem.type === 'movie') {
      libraryItem.videos = [];
    }

    const res = await fetch(`${BASE_URL}/datastorePut`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        authKey,
        collection: 'libraryItem',
        changes: [libraryItem]
      })
    });
    const data = await res.json();
    if (data.error) {
      console.error('addToLibrary API Error:', data.error);
      throw new Error(data.error.message || 'API Error');
    }
    return true;
  },

  /**
   * وضع علامة "تم المشاهدة"
   */
  async markAsWatched(authKey, itemId, duration) {
    const res = await fetch(`${BASE_URL}/datastorePut`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        authKey,
        collection: 'libraryItem',
        changes: [{
          _id: itemId,
          state: {
            timeOffset: duration || 9999,
            duration: duration || 9999,
            watched: true,
            lastWatched: new Date().toISOString(),
            noNotif: true
          },
          _mtime: new Date().toISOString()
        }]
      })
    });
    return res.ok;
  },

  /**
   * حذف من المكتبة
   */
  async removeFromLibrary(authKey, libraryItem) {
    const payloadItem = {
      ...libraryItem,
      removed: true,
      removedAt: new Date().toISOString(),
      _mtime: new Date().toISOString()
    };

    if (payloadItem.releaseInfo) payloadItem.releaseInfo = String(payloadItem.releaseInfo);
    if (payloadItem.year) payloadItem.year = String(payloadItem.year);
    if (!Array.isArray(payloadItem.genres)) payloadItem.genres = [];
    if (!Array.isArray(payloadItem.cast)) payloadItem.cast = [];

    const res = await fetch(`${BASE_URL}/datastorePut`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        authKey,
        collection: 'libraryItem',
        changes: [payloadItem]
      })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return true;
  }
};
