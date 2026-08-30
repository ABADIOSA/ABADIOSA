// modules/library.js — Library cache management

import { StremioAPI } from './stremio-api.js';

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const Library = {
  /**
   * جلب المكتبة — من الـ cache أو API
   */
  async get(authKey, forceRefresh = false, sortMethod = 'lastwatched') {
    const cached = await chrome.storage.local.get(['library_cache']);
    const cache = cached.library_cache;

    const isValid = cache && cache.allItems &&
      (Date.now() - cache.lastFetch < CACHE_DURATION) &&
      !forceRefresh;

    let allItems = [];
    if (isValid) {
      allItems = cache.allItems;
    } else {
      allItems = await StremioAPI.getLibrary(authKey);
      await chrome.storage.local.set({ 
        library_cache: { allItems, lastFetch: Date.now() } 
      });
    }

    // Sort function
    const sortFn = (a, b) => {
      switch (sortMethod) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        case 'namereverse':
          return (b.name || '').localeCompare(a.name || '');
        case 'timeswatched':
          return (b.state?.timesWatched || 0) - (a.state?.timesWatched || 0);
        case 'watched': // prioritize watched
          return (b.state?.watched ? 1 : 0) - (a.state?.watched ? 1 : 0);
        case 'notwatched': // prioritize not watched
          return (a.state?.watched ? 1 : 0) - (b.state?.watched ? 1 : 0);
        case 'lastwatched':
        default:
          // Last watched or newest added
          const dateA = new Date(a.state?.lastWatched || a._mtime || 0).getTime();
          const dateB = new Date(b.state?.lastWatched || b._mtime || 0).getTime();
          return dateB - dateA;
      }
    };

    const movies = allItems
      .filter(i => i.type === 'movie' && !i.removed)
      .sort(sortFn);

    const series = allItems
      .filter(i => i.type === 'series' && !i.removed)
      .sort(sortFn);

    const continueWatching = allItems
      .filter(i =>
        !i.removed &&
        i.state &&
        i.state.timeOffset > 0 &&
        !i.state.watched
      )
      .sort((a, b) =>
        new Date(b.state?.lastWatched || 0).getTime() - new Date(a.state?.lastWatched || 0).getTime()
      )
      .slice(0, 20);

    return { movies, series, continue: continueWatching };
  },

  /**
   * حذف الـ cache
   */
  async invalidate() {
    await chrome.storage.local.remove(['library_cache']);
  }
};
