// modules/cinemeta.js — Cinemeta search & metadata

const CINEMETA_BASE = 'https://v3-cinemeta.strem.io';

export const Cinemeta = {
  /**
   * بحث عن أفلام ومسلسلات بالاسم
   */
  async search(query) {
    const encoded = encodeURIComponent(query);

    const [moviesRes, seriesRes] = await Promise.allSettled([
      fetch(`${CINEMETA_BASE}/catalog/movie/top/search=${encoded}.json`),
      fetch(`${CINEMETA_BASE}/catalog/series/top/search=${encoded}.json`)
    ]);

    let movies = [];
    let series = [];

    if (moviesRes.status === 'fulfilled' && moviesRes.value.ok) {
      const data = await moviesRes.value.json();
      movies = data.metas || [];
    }

    if (seriesRes.status === 'fulfilled' && seriesRes.value.ok) {
      const data = await seriesRes.value.json();
      series = data.metas || [];
    }

    return [...movies, ...series];
  },

  /**
   * جلب تفاصيل عمل بـ IMDB ID
   */
  async getMeta(type, imdbId) {
    const res = await fetch(`${CINEMETA_BASE}/meta/${type}/${imdbId}.json`);
    if (!res.ok) throw new Error(`Cinemeta error: ${res.status}`);
    const data = await res.json();
    return data.meta;
  }
};
