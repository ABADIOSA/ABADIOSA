// content.js — يُحقن في مواقع التقييم وبحث جوجل ويضيف زر Stremio

(function () {
  'use strict';

  const hostname = window.location.hostname;
  const href = window.location.href;

  let currentLang = 'ar';

  const getBtnText = (action, hasPlayIcon = false) => {
    const play = hasPlayIcon ? '▶ ' : '';
    if (currentLang === 'ar') {
      return action === 'open' ? play + 'فتح في ستريميو' : play + 'حفظ في ستريميو';
    }
    return action === 'open' ? play + 'Open in Stremio' : play + 'Save to Stremio';
  };

  const getStatusText = (status) => {
    if (currentLang === 'ar') {
      if (status === 'opening') return 'جارِ الفتح...';
      if (status === 'opened') return 'تم الفتح ✓';
      if (status === 'saving') return 'جارِ الحفظ...';
      if (status === 'saved') return 'تم الحفظ بنجاح ✓';
      if (status === 'saved_short') return 'تم الحفظ!';
      if (status === 'loading') return 'جارِ البحث...';
      if (status === 'error') return 'خطأ';
      if (status === 'failed') return 'فشل';
    }
    if (status === 'opening') return 'Opening...';
    if (status === 'opened') return 'Opened ✓';
    if (status === 'saving') return 'Saving...';
    if (status === 'saved') return 'Saved to Stremio ✓';
    if (status === 'saved_short') return 'Saved!';
    if (status === 'loading') return 'Loading...';
    if (status === 'error') return 'Error';
    if (status === 'failed') return 'Failed';
  };

  const injectFontsIfNeeded = () => {
    if (!document.getElementById('stremio-hub-fonts')) {
      const fontStyle = document.createElement('style');
      fontStyle.id = 'stremio-hub-fonts';
      fontStyle.textContent = `
        @font-face {
          font-family: 'Thmanyah';
          src: url('${chrome.runtime.getURL('fonts/thmanyahsans-Regular.woff2')}') format('woff2');
          font-weight: normal;
          font-style: normal;
        }
        @font-face {
          font-family: 'Thmanyah';
          src: url('${chrome.runtime.getURL('fonts/thmanyahsans-Bold.woff2')}') format('woff2');
          font-weight: bold;
          font-style: normal;
        }
        .stremio-ar, .stremio-ar * { font-family: 'Thmanyah', system-ui, -apple-system, sans-serif !important; }
      `;
      document.head.appendChild(fontStyle);
    }
  };


  // ==================== Site Detectors ====================

  const detectors = {
    google: {
      match: () => hostname.includes('google.com') && window.location.href.includes('/search'),
      inject: injectGoogle
    },
    letterboxd: {
      match: () => hostname.includes('letterboxd.com') && window.location.href.includes('/film/'),
      inject: injectLetterboxd
    },
    imdb: {
      match: () => hostname.includes('imdb.com') && /\/title\/tt\d+/.test(window.location.href),
      inject: injectIMDB
    },
    tmdb: {
      match: () => hostname.includes('themoviedb.org') && (window.location.href.includes('/movie/') || window.location.href.includes('/tv/')),
      inject: injectTMDB
    },
    rt: {
      match: () => hostname.includes('rottentomatoes.com') && (window.location.href.includes('/m/') || window.location.href.includes('/tv/')),
      inject: injectRT
    },
    metacritic: {
      match: () => hostname.includes('metacritic.com') && (window.location.href.includes('/movie/') || window.location.href.includes('/tv/')),
      inject: injectMetacritic
    },
    trakt: {
      match: () => hostname.includes('trakt.tv') && (window.location.href.includes('/movies/') || window.location.href.includes('/shows/')),
      inject: injectTrakt
    }
  };

  // ==================== Main Init ====================

  async function init() {
    if (document.getElementById('stremio-hub-btn') || document.getElementById('stremio-google-btn')) return;

    let stored;
    try {
      stored = await chrome.storage.local.get(['sitesEnabled', 'siteActions', 'language']);
    } catch (err) {
      if (err.message && err.message.includes('Extension context invalidated')) {
        console.warn('StremioHub: Extension context invalidated. Please reload the page.');
        if (typeof observer !== 'undefined' && observer) observer.disconnect();
        return;
      }
      console.error('StremioHub Init Error:', err);
      return;
    }

    currentLang = stored.language || 'ar';
    if (currentLang === 'ar') injectFontsIfNeeded();
    const sitesEnabled = stored.sitesEnabled || {
      google: true, letterboxd: true, imdb: true, tmdb: true, rt: true, metacritic: true, trakt: true
    };
    const siteActions = stored.siteActions || {
      google: 'save', letterboxd: 'save', imdb: 'save', tmdb: 'save', rt: 'save', metacritic: 'save', trakt: 'save'
    };

    for (const [key, detector] of Object.entries(detectors)) {
      if (detector.match() && sitesEnabled[key] !== false) {
        detector.inject(siteActions[key] || 'save');
        break;
      }
    }
  }

  // ==================== Google Search ====================
  function injectGoogle(action = 'save') {
    if (document.getElementById('stremio-google-btn')) return;

    // Get Title and Type from Knowledge Panel
    let titleEl = document.querySelector('[data-attrid="title"]') || document.querySelector('h2[data-attrid="title"]');
    let title = titleEl?.textContent?.trim();
    let subtitleEl = document.querySelector('[data-attrid="subtitle"]');
    let subtitle = subtitleEl?.textContent?.toLowerCase() || '';
    let year = subtitle.match(/\d{4}/)?.[0];
    let type = 'movie'; // default

    // Detect type using common English/Arabic keywords in subtitle
    if (subtitle.match(/(tv|series|season|seasons|مسلسل|موسم|مواسم|حلقات)/i)) {
      type = 'series';
    }

    // Advanced: Extract from Google's internal data-maindata for exact canonical info
    const mainDataAttr = document.querySelector('[data-maindata]')?.getAttribute('data-maindata');
    if (mainDataAttr) {
        try {
            const mainData = JSON.parse(mainDataAttr);
            // mainData[2] often holds the canonical title (useful if UI title is missing)
            if (!title && mainData[2]) title = mainData[2];
            // mainData[4][0] often holds the entity type ("TV" or "Movie")
            if (mainData[4] && Array.isArray(mainData[4])) {
                const typeStr = mainData[4][0]?.toLowerCase();
                if (typeStr === 'tv') type = 'series';
                else if (typeStr === 'movie') type = 'movie';
            }
        } catch(e) {
            console.error('StremioHub: Failed to parse data-maindata', e);
        }
    }

    if (!title) return;

    // Try to get IMDB ID from DOM for perfect matching
    let imdbLink = document.querySelector("a[href*='https://www.imdb.com/title']")?.href || document.querySelector("a[href*='https://m.imdb.com/title']")?.href;
    const imdbIdMatch = imdbLink?.match(/\/title\/(tt\d+)/);
    const imdbId = imdbIdMatch ? imdbIdMatch[1] : null;

    const iconUrl = chrome.runtime.getURL('icons/stremio-icon.png');
    const btnText = getBtnText(action);

    const handleStremioClick = async (e, statusSpan, feedbackCallback) => {
      e.preventDefault();

      if (action === 'open') {
        if (statusSpan) statusSpan.textContent = getStatusText('opening');
        chrome.runtime.sendMessage({
          type: 'OPEN_IN_STREMIO_DIRECT',
          query: title, year, mediaType: type, imdbId
        }, (res) => {
          if (feedbackCallback) feedbackCallback(res && res.success);
          if (statusSpan) {
            if (res && res.success) {
              if (res.itemMeta && typeof showStremioHubToast === 'function') showStremioHubToast(res.itemMeta);
              statusSpan.textContent = getStatusText('opened');
            } else {
              statusSpan.textContent = getStatusText('error');
            }
            setTimeout(() => {
              statusSpan.textContent = btnText;
              statusSpan.style.color = 'inherit';
            }, 3000);
          }
        });
        return;
      }

      const stored = await chrome.storage.local.get('autoSave');
      const autoSave = stored.autoSave !== false;

      if (autoSave) {
        if (statusSpan) statusSpan.textContent = getStatusText('saving');
        chrome.runtime.sendMessage({
          type: 'ADD_TO_LIBRARY',
          query: title, year, mediaType: type, imdbId
        }, (res) => {
          if (feedbackCallback) feedbackCallback(res && res.success);
          if (statusSpan) {
            if (res && res.success) {
              if (res.itemMeta && typeof showStremioHubToast === 'function') showStremioHubToast(res.itemMeta);
              statusSpan.textContent = getStatusText('saved_short');
              statusSpan.style.color = '#34d399';
            } else {
              statusSpan.textContent = getStatusText('error');
              statusSpan.style.color = '#f87171';
            }
            setTimeout(() => {
              statusSpan.textContent = btnText;
              statusSpan.style.color = 'inherit';
            }, 3000);
          }
        });
      } else {
        if (statusSpan) statusSpan.textContent = getStatusText('loading');
        chrome.runtime.sendMessage({
          type: 'SEARCH_IN_POPUP',
          query: title, year, mediaType: type
        });
        setTimeout(() => {
          if (statusSpan) {
            statusSpan.textContent = btnText;
            statusSpan.style.color = 'inherit';
          }
        }, 2000);
      }
    };

    // Design Pattern 1: Horizontal List (Mobile/Desktop Watch Now)
    const watchNowMain = document.querySelector("div[role='list'][data-ved][lang]");
    if (watchNowMain) {
      // Hijack the first button
      const mainTag = watchNowMain.querySelector("a[ping]");
      if (mainTag) {
        mainTag.id = 'stremio-google-btn';
        if (currentLang === 'ar') mainTag.classList.add('stremio-ar');
        mainTag.href = '#';
        const img = mainTag.querySelector("img");
        if (img) {
          img.src = iconUrl;
          img.style.objectFit = 'cover';
          img.style.borderRadius = '50%';
        }

        const textDiv = mainTag.querySelector('div:nth-child(2)');
        if (textDiv) {
          if (textDiv.firstChild) {
            textDiv.firstChild.textContent = currentLang === 'ar' ? 'ستريميو' : 'Stremio';
            textDiv.firstChild.style.color = '#a78bfa';
            textDiv.firstChild.style.fontWeight = '600';
          }
          if (textDiv.lastChild) {
            textDiv.lastChild.textContent = btnText;
            textDiv.lastChild.classList.add('stremio-status');
            textDiv.lastChild.style.color = 'inherit';
            textDiv.lastChild.style.opacity = '0.8';
            textDiv.lastChild.style.fontWeight = '500';
          }
        }
        mainTag.addEventListener('click', (e) => {
          handleStremioClick(e, textDiv?.lastChild, (isSuccess) => {
            if (img) {
              const color = isSuccess ? '#34d399' : '#f87171';
              img.style.transition = 'all 0.3s ease';
              img.style.boxShadow = `0 0 0 3px ${color}, 0 4px 12px ${color}80`;
              img.style.transform = 'scale(1.1)';
              setTimeout(() => {
                img.style.boxShadow = 'none';
                img.style.transform = 'scale(1)';
              }, 3000);
            }
          });
        });
        return;
      }
    }

    // Design Pattern 2: Wholepage media actions (Desktop)
    let watchOptions = document.querySelectorAll("div[data-attrid='kc:/tv/tv_program:media_actions_wholepage'], div[data-attrid='kc:/film/film:media_actions_wholepage']");
    if (watchOptions.length > 0) {
      let watchOption = watchOptions[0];
      let firstChild = watchOption.firstElementChild?.firstElementChild;
      if (firstChild) {
        let watchNowEle = firstChild.firstElementChild;
        if (watchNowEle) {
          watchNowEle.id = 'stremio-google-btn';
          if (currentLang === 'ar') watchNowEle.classList.add('stremio-ar');
          watchNowEle.innerHTML = `
             <a class="stremio-cta__href" href='#' style="display: flex; align-items: center; padding: 10px 18px; background: rgba(145, 109, 213, 0.1); border: 1px solid rgba(145, 109, 213, 0.4); border-radius: 24px; text-decoration: none; margin-bottom: 12px; transition: all 0.2s ease;">
               <img style='width: 32px; height: 32px; border-radius: 50%; margin-right: 14px; object-fit: cover; box-shadow: 0 2px 6px rgba(0,0,0,0.2);' src="${iconUrl}" />
               <div style="display: flex; flex-direction: column; justify-content: center;">
                 <div style="font-weight: 600; color: #a78bfa; font-family: Roboto, Arial, sans-serif; font-size: 15px; line-height: 1.2;">${currentLang === 'ar' ? 'ستريميو' : 'Stremio'}</div>
                 <div class="stremio-status" style="font-size: 13px; font-weight: 500; color: inherit; opacity: 0.8; font-family: Roboto, Arial, sans-serif; margin-top: 2px;">${btnText}</div>
               </div>
             </a>`;
          const link = watchNowEle.querySelector('a');

          link.addEventListener('mouseenter', () => {
            link.style.background = 'rgba(145, 109, 213, 0.2)';
            link.style.transform = 'translateY(-1px)';
          });
          link.addEventListener('mouseleave', () => {
            link.style.background = 'rgba(145, 109, 213, 0.1)';
            link.style.transform = 'translateY(0)';
          });

          const statusSpan = watchNowEle.querySelector('.stremio-status');
          const img = watchNowEle.querySelector('img');
          link.addEventListener('click', (e) => {
            handleStremioClick(e, statusSpan, (isSuccess) => {
              if (img) {
                const color = isSuccess ? '#34d399' : '#f87171';
                img.style.transition = 'all 0.3s ease';
                img.style.boxShadow = `0 0 0 3px ${color}, 0 4px 12px ${color}80`;
                img.style.transform = 'scale(1.1)';
                setTimeout(() => {
                  img.style.boxShadow = 'none';
                  img.style.transform = 'scale(1)';
                }, 3000);
              }
            });
          });
          return;
        }
      }
    }

    // Fallback if neither exists, but we are on a movie page
    const reviewContainer = document.querySelector("div[data-attrid^='kc:/film/film:'], div[data-attrid^='kc:/tv/tv_program:']");
    if (reviewContainer) {
      // Create a floating action button (FAB) as fallback
      const fabStremio = document.createElement("a");
      fabStremio.id = "stremio-google-btn";
      if (currentLang === 'ar') fabStremio.classList.add('stremio-ar');
      fabStremio.href = "#";
      fabStremio.innerHTML = `<img style='width: 48px;height: 48px; border-radius: 50%; box-shadow: 0 4px 10px rgba(0,0,0,0.3); transition: all 0.3s ease;' src="${iconUrl}" />`;
      fabStremio.style.cssText = "position: fixed; bottom: 30px; right: 30px; z-index: 999999; cursor: pointer; transition: 0.2s;";

      const img = fabStremio.querySelector('img');

      fabStremio.addEventListener('mouseenter', () => img.style.transform = 'scale(1.1)');
      fabStremio.addEventListener('mouseleave', () => img.style.transform = 'scale(1)');

      fabStremio.addEventListener('click', (e) => {
        handleStremioClick(e, null, (isSuccess) => {
          const color = isSuccess ? '#34d399' : '#f87171';
          img.style.boxShadow = `0 0 0 4px ${color}, 0 6px 16px ${color}80`;
          img.style.transform = 'scale(1.15)';
          setTimeout(() => {
            img.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';
            img.style.transform = 'scale(1)';
          }, 3000);
        });
      });
      document.body.appendChild(fabStremio);
    }
  }

  // ==================== Letterboxd ====================

  function injectLetterboxd(action = 'save') {
    if (document.getElementById('stremio-hub-btn')) return;
    const watchElement = document.querySelector('.js-actions-panel');
    if (!watchElement) return;

    let title = document.querySelector('.inline-production-masthead .primaryname a')?.textContent?.trim();
    if (!title) {
      title = document.querySelector('h1.headline-1, .headline-1, h1[class*="title"]')?.textContent?.trim();
    }

    let year = document.querySelector('.inline-production-masthead .releasedate a')?.textContent?.trim();
    if (!year) {
      year = document.querySelector('.number[href*="/films/year/"], a[href*="/films/year/"]')?.textContent?.trim();
    }

    const type = 'movie';

    if (!title) return;

    const btnText = getBtnText(action);
    const iconUrl = chrome.runtime.getURL('icons/stremio-icon.png');
    const stremioButton = document.createElement('button');
    stremioButton.id = 'stremio-hub-btn';
    if (currentLang === 'ar') stremioButton.classList.add('stremio-ar');
    stremioButton.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%;">
        <img title="Stremio" style="width: 16px; height: 16px; border-radius: 3px; object-fit: cover; box-shadow: 0 1px 3px rgba(0,0,0,0.3);" src="${iconUrl}"/>
        <span style="font-weight: 700; font-size: 11px; color: #99aabb; letter-spacing: 0.08em; text-transform: uppercase; font-family: 'GraphikWeb', -apple-system, sans-serif;">${btnText}</span>
      </div>
    `;
    stremioButton.setAttribute('style', `
      display: block;
      width: 100%;
      cursor: pointer;
      border: 1px solid #303840;
      border-radius: 3px;
      margin-bottom: 12px;
      padding: 10px 8px;
      background-color: #1c2228;
      transition: all 0.15s ease;
      box-sizing: border-box;
      -webkit-font-smoothing: antialiased;
    `);

    stremioButton.addEventListener('mouseenter', () => {
      stremioButton.style.backgroundColor = '#26213a';
      stremioButton.style.borderColor = '#7B52C8';
      stremioButton.querySelector('span').style.color = '#c4aaff';
    });
    stremioButton.addEventListener('mouseleave', () => {
      stremioButton.style.backgroundColor = '#1c2228';
      stremioButton.style.borderColor = '#303840';
      stremioButton.querySelector('span').style.color = '#99aabb';
    });

    stremioButton.addEventListener('click', async (e) => {
      e.preventDefault();
      const span = stremioButton.querySelector('span');

      if (action === 'open') {
        span.textContent = getStatusText('opening');
        chrome.runtime.sendMessage({ type: 'OPEN_IN_STREMIO_DIRECT', query: title, year, mediaType: type }, (res) => {
          if (res && res.success) {
            if (res.itemMeta && typeof showStremioHubToast === 'function') showStremioHubToast(res.itemMeta);
            span.textContent = getStatusText('opened');
          } else {
            span.textContent = getStatusText('failed');
          }
          setTimeout(() => span.textContent = btnText, 3000);
        });
        return;
      }

      const stored = await chrome.storage.local.get('autoSave');
      const autoSave = stored.autoSave !== false;

      if (autoSave) {
        span.textContent = getStatusText('saving');
        chrome.runtime.sendMessage({ type: 'ADD_TO_LIBRARY', query: title, year, mediaType: type }, (res) => {
          if (res && res.success) {
            if (res.itemMeta && typeof showStremioHubToast === 'function') showStremioHubToast(res.itemMeta);
            span.textContent = getStatusText('saved');
            stremioButton.style.borderColor = '#34d399';
            stremioButton.style.backgroundColor = 'rgba(52, 211, 153, 0.15)';
            span.style.color = '#34d399';
          } else {
            span.textContent = getStatusText('failed');
          }
          setTimeout(() => {
            span.textContent = btnText;
            stremioButton.style.borderColor = 'rgba(145, 109, 213, 0.4)';
            stremioButton.style.backgroundColor = 'rgba(145, 109, 213, 0.15)';
            span.style.color = '#e6e6ea';
          }, 3000);
        });
      } else {
        span.textContent = getStatusText('loading');
        chrome.runtime.sendMessage({ type: 'SEARCH_IN_POPUP', query: title, year, mediaType: type });
        setTimeout(() => {
          span.textContent = btnText;
          stremioButton.style.borderColor = 'rgba(145, 109, 213, 0.4)';
          stremioButton.style.backgroundColor = 'rgba(145, 109, 213, 0.15)';
          span.style.color = '#e6e6ea';
        }, 2000);
      }
    });

    watchElement.insertBefore(stremioButton, watchElement.firstChild);
  }

  // ==================== IMDB ====================

  function injectIMDB(action = 'save') {
    if (document.getElementById('stremio-hub-btn')) return;
    const imdbButton = document.querySelector('[data-testid="tm-box-wl-button"]');
    if (!imdbButton) return;

    const titleEl = document.querySelector('[data-testid="hero__pageTitle"]') || document.querySelector('h1');
    const title = titleEl?.textContent?.trim();
    const yearEl = document.querySelector('a[href*="/releaseinfo"], .sc-8c396aa2-2, [data-testid="title-details-releasedate"] a');
    const year = yearEl?.textContent?.match(/\d{4}/)?.[0];
    const isSeries = document.title.toLowerCase().includes('tv series') || document.title.toLowerCase().includes('tv mini');
    const type = isSeries ? 'series' : 'movie';

    if (!title) return;

    const btnText = getBtnText(action, true);

    const stremioButton = document.createElement('button');
    stremioButton.id = 'stremio-hub-btn';
    if (currentLang === 'ar') stremioButton.classList.add('stremio-ar');
    stremioButton.className = 'circular-strmio-button';
    if (currentLang === 'ar') stremioButton.style.fontFamily = "'Thmanyah', system-ui, -apple-system, sans-serif";
    stremioButton.innerHTML = btnText;

    // Style to look native but distinct (Stremio purple)
    stremioButton.style.cssText = `
      width: 100%;
      background: #7b5ea7;
      color: white;
      border: none;
      border-radius: 24px;
      padding: 10px 16px;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      transition: background 0.2s, transform 0.2s;
      font-family: ${currentLang === 'ar' ? "'Thmanyah', system-ui, -apple-system, sans-serif !important" : "Roboto, Helvetica, Arial, sans-serif"};
    `;

    stremioButton.addEventListener('mouseenter', () => {
      stremioButton.style.background = '#9070c8';
      stremioButton.style.transform = 'translateY(-1px)';
    });
    stremioButton.addEventListener('mouseleave', () => {
      stremioButton.style.background = '#7b5ea7';
      stremioButton.style.transform = 'translateY(0)';
    });

    stremioButton.addEventListener('click', async (e) => {
      e.preventDefault();
      const imdbIdMatch = window.location.pathname.match(new RegExp('/title/(tt\\\\d+)'));
      const imdbId = imdbIdMatch ? imdbIdMatch[1] : null;

      if (action === 'open') {
        stremioButton.innerHTML = getStatusText('opening');
        chrome.runtime.sendMessage({ type: 'OPEN_IN_STREMIO_DIRECT', query: title, year, mediaType: type, imdbId }, (res) => {
          if (res && res.success) {
            if (res.itemMeta && typeof showStremioHubToast === 'function') showStremioHubToast(res.itemMeta);
            stremioButton.innerHTML = getStatusText('opened');
          } else {
            stremioButton.innerHTML = getStatusText('failed');
          }
          setTimeout(() => stremioButton.innerHTML = btnText, 3000);
        });
        return;
      }

      const stored = await chrome.storage.local.get('autoSave');
      const autoSave = stored.autoSave !== false;

      if (autoSave) {
        stremioButton.innerHTML = getStatusText('saving');
        chrome.runtime.sendMessage({ type: 'ADD_TO_LIBRARY', query: title, year, mediaType: type, imdbId }, (res) => {
          if (res && res.success) {
            if (res.itemMeta && typeof showStremioHubToast === 'function') showStremioHubToast(res.itemMeta);
            stremioButton.innerHTML = getStatusText('saved');
            stremioButton.style.background = '#34d399';
          } else {
            stremioButton.innerHTML = getStatusText('failed');
            stremioButton.style.background = '#f87171';
          }
          setTimeout(() => {
            stremioButton.innerHTML = btnText;
            stremioButton.style.background = '#7b5ea7';
          }, 3000);
        });
      } else {
        stremioButton.innerHTML = getStatusText('loading');
        chrome.runtime.sendMessage({ type: 'SEARCH_IN_POPUP', query: title, year, mediaType: type });
        setTimeout(() => {
          stremioButton.innerHTML = btnText;
          stremioButton.style.background = '#7b5ea7';
        }, 2000);
      }
    });

    // We insert it into the parent container of the IMDB split button, so it stacks neatly.
    const splitBtn = imdbButton.closest('.ipc-split-button') || imdbButton;
    splitBtn.parentNode.insertBefore(stremioButton, splitBtn);
  }

  // ==================== TMDB ====================

  function injectTMDB(action = 'save') {
    if (document.getElementById('stremio-hub-btn')) return;
    const actionsElement = document.querySelector('ul.auto.actions');
    if (!actionsElement) return;

    const title = document.querySelector('.title h2 a, h2.title a, h2 a')?.textContent?.trim() || document.querySelector('h2')?.textContent?.trim();
    const year = document.querySelector('.release_date, .release, .tag')?.textContent?.match(/\d{4}/)?.[0];
    const type = window.location.href.includes('/tv/') ? 'series' : 'movie';

    if (!title) return;

    const btnText = getBtnText(action);
    const iconUrl = chrome.runtime.getURL('icons/stremio-icon.png');
    const stremioButton = document.createElement('a');
    stremioButton.id = 'stremio-hub-btn';
    if (currentLang === 'ar') stremioButton.classList.add('stremio-ar');
    stremioButton.title = btnText;
    stremioButton.innerHTML = `<img alt="${btnText}" style="width: 46px; height: 46px; border-radius: 50%; object-fit: cover; transition: all 0.3s ease;" src="${iconUrl}"/>`;
    
    if (currentLang === 'ar') {
      stremioButton.setAttribute('style', 'margin-left: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; border-radius: 50%;');
      stremioButton.style.fontFamily = "'Thmanyah', system-ui, -apple-system, sans-serif";
    } else {
      stremioButton.setAttribute('style', 'margin-left: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s; border-radius: 50%;');
    }


    const img = stremioButton.querySelector('img');

    stremioButton.addEventListener('mouseenter', () => img.style.transform = 'scale(1.1)');
    stremioButton.addEventListener('mouseleave', () => img.style.transform = 'scale(1)');

    const showFeedback = (res) => {
      const isSuccess = res && res.success;
      if (isSuccess && res.itemMeta && typeof showStremioHubToast === 'function') {
        showStremioHubToast(res.itemMeta);
      }
      const color = isSuccess ? '#34d399' : '#f87171';
      img.style.boxShadow = `0 0 0 3px ${color}, 0 4px 12px ${color}80`;
      img.style.transform = 'scale(1.1)';
      setTimeout(() => {
        img.style.boxShadow = 'none';
        img.style.transform = 'scale(1)';
      }, 3000);
    };

    stremioButton.addEventListener('click', async (e) => {
      e.preventDefault();

      if (action === 'open') {
        chrome.runtime.sendMessage({ type: 'OPEN_IN_STREMIO_DIRECT', query: title, year, mediaType: type }, (res) => {
          showFeedback(res);
        });
        return;
      }

      const stored = await chrome.storage.local.get('autoSave');
      const autoSave = stored.autoSave !== false;

      if (autoSave) {
        chrome.runtime.sendMessage({ type: 'ADD_TO_LIBRARY', query: title, year, mediaType: type }, (res) => {
          showFeedback(res);
        });
      } else {
        chrome.runtime.sendMessage({ type: 'SEARCH_IN_POPUP', query: title, year, mediaType: type });
      }
    });

    actionsElement.appendChild(stremioButton);
  }

  // ==================== Rotten Tomatoes ====================

  function injectRT(action = 'save') {
    if (document.getElementById('stremio-hub-btn')) return;
    const ctaWrap = document.querySelector('.media-scorecard');
    if (!ctaWrap) return;

    const title = document.querySelector('h1, [data-qa="score-panel-title"]')?.textContent?.trim();
    const year = document.querySelector('.scoreboard__info, .info, [data-qa="movie-info-item"]')?.textContent?.match(/\d{4}/)?.[0];
    const type = window.location.href.includes('/tv/') ? 'series' : 'movie';

    if (!title) return;

    const btnText = getBtnText(action);
    const iconUrl = chrome.runtime.getURL('icons/stremio-icon.png');
    const stremioButton = document.createElement('button');
    stremioButton.id = 'stremio-hub-btn';
    if (currentLang === 'ar') stremioButton.classList.add('stremio-ar');
    stremioButton.innerHTML = `<img title="StremioHub" style="float: left;width: 30px;height: 30px;border-radius:6px;object-fit:cover;" src="${iconUrl}"/><span style="font-weight: bold;font-size: 14px;margin-top: 4px;margin-left: 10px;padding: 0;float: left;color: #7b5ea7;">${btnText}</span>`;
    
    if (currentLang === 'ar') {
      stremioButton.setAttribute('style', 'height:50px;margin-right: 10px;text-align: left;margin-bottom: 10px;background-color: white; border: 1px solid #7b5ea7; border-radius: 30px; padding: 10px 20px; cursor: pointer; display: flex; align-items: center; transition: 0.2s;');
      stremioButton.style.fontFamily = "'Thmanyah', system-ui, -apple-system, sans-serif";
    } else {
      stremioButton.setAttribute('style', 'height:50px;margin-right: 10px;text-align: left;margin-bottom: 10px;background-color: white; border: 1px solid #7b5ea7; border-radius: 30px; padding: 10px 20px; cursor: pointer; display: flex; align-items: center; transition: 0.2s;');
    }


    stremioButton.addEventListener('mouseenter', () => stremioButton.style.backgroundColor = '#f3e8ff');
    stremioButton.addEventListener('mouseleave', () => stremioButton.style.backgroundColor = 'white');

    stremioButton.addEventListener('click', async (e) => {
      e.preventDefault();
      const span = stremioButton.querySelector('span');

      if (action === 'open') {
        span.textContent = getStatusText('opening');
        chrome.runtime.sendMessage({ type: 'OPEN_IN_STREMIO_DIRECT', query: title, year, mediaType: type }, (res) => {
          if (res && res.success) {
            if (res.itemMeta && typeof showStremioHubToast === 'function') showStremioHubToast(res.itemMeta);
            span.textContent = getStatusText('opened');
          } else {
            span.textContent = getStatusText('failed');
          }
          setTimeout(() => span.textContent = btnText, 3000);
        });
        return;
      }

      const stored = await chrome.storage.local.get('autoSave');
      const autoSave = stored.autoSave !== false;

      if (autoSave) {
        span.textContent = getStatusText('saving');
        chrome.runtime.sendMessage({ type: 'ADD_TO_LIBRARY', query: title, year, mediaType: type }, (res) => {
          if (res && res.success) {
            if (res.itemMeta && typeof showStremioHubToast === 'function') showStremioHubToast(res.itemMeta);
            span.textContent = getStatusText('saved');
            stremioButton.style.border = '1px solid #34d399';
            span.style.color = '#34d399';
          } else {
            span.textContent = getStatusText('failed');
          }
          setTimeout(() => {
            span.textContent = btnText;
            stremioButton.style.border = '1px solid #7b5ea7';
            span.style.color = '#7b5ea7';
          }, 3000);
        });
      } else {
        span.textContent = getStatusText('loading');
        chrome.runtime.sendMessage({ type: 'SEARCH_IN_POPUP', query: title, year, mediaType: type });
        setTimeout(() => {
          span.textContent = btnText;
        }, 2000);
      }
    });

    ctaWrap.insertBefore(stremioButton, ctaWrap.firstChild);
  }

  // ==================== Metacritic ====================

  function injectMetacritic(action = 'save') {
    if (document.getElementById('stremio-hub-btn')) return;

    const titleEl = document.querySelector('.c-productHero_title h1') || document.querySelector('h1');
    const title = titleEl?.textContent?.trim();
    const year = document.querySelector('.c-productHero_score-container, .release_date, .c-heroMetadata')
      ?.textContent?.match(/\d{4}/)?.[0];
    const type = window.location.href.includes('/tv/') ? 'series' : 'movie';

    if (!title || !titleEl) return;

    const btnText = getBtnText(action);
    const iconUrl = chrome.runtime.getURL('icons/stremio-icon.png');

    const stremioButton = document.createElement('a');
    stremioButton.id = 'stremio-hub-btn';
    if (currentLang === 'ar') stremioButton.classList.add('stremio-ar');
    stremioButton.title = btnText;
    stremioButton.innerHTML = `<img alt="${btnText}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; transition: all 0.3s ease; box-shadow: 0 4px 10px rgba(0,0,0,0.3);" src="${iconUrl}"/>`;

    // We make it inline-block and give it a little margin so it sits next to the title
    
    if (currentLang === 'ar') {
      stremioButton.setAttribute('style', 'margin-left: 16px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;');
      stremioButton.style.fontFamily = "'Thmanyah', system-ui, -apple-system, sans-serif";
    } else {
      stremioButton.setAttribute('style', 'margin-left: 16px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;');
    }


    const img = stremioButton.querySelector('img');

    stremioButton.addEventListener('mouseenter', () => img.style.transform = 'scale(1.1)');
    stremioButton.addEventListener('mouseleave', () => img.style.transform = 'scale(1)');

    const showFeedback = (res) => {
      const isSuccess = res && res.success;
      if (isSuccess && res.itemMeta && typeof showStremioHubToast === 'function') {
        showStremioHubToast(res.itemMeta);
      }
      const color = isSuccess ? '#34d399' : '#f87171';
      img.style.boxShadow = `0 0 0 3px ${color}, 0 4px 12px ${color}80`;
      img.style.transform = 'scale(1.1)';
      setTimeout(() => {
        img.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';
        img.style.transform = 'scale(1)';
      }, 3000);
    };

    stremioButton.addEventListener('click', async (e) => {
      e.preventDefault();

      if (action === 'open') {
        chrome.runtime.sendMessage({ type: 'OPEN_IN_STREMIO_DIRECT', query: title, year, mediaType: type }, (res) => {
          showFeedback(res);
        });
        return;
      }

      const stored = await chrome.storage.local.get('autoSave');
      const autoSave = stored.autoSave !== false;

      if (autoSave) {
        chrome.runtime.sendMessage({ type: 'ADD_TO_LIBRARY', query: title, year, mediaType: type }, (res) => {
          showFeedback(res);
        });
      } else {
        chrome.runtime.sendMessage({ type: 'SEARCH_IN_POPUP', query: title, year, mediaType: type });
      }
    });

    // Append directly to the h1 so it stays right next to the movie/show title permanently
    titleEl.style.display = 'inline-flex';
    titleEl.style.alignItems = 'center';
    titleEl.appendChild(stremioButton);
  }

  // ==================== Trakt ====================

  function injectTrakt(action = 'save') {
    if (document.getElementById('stremio-hub-btn')) return;

    const titleEl = document.querySelector('h1');
    if (!titleEl) return;

    let title = titleEl.childNodes[0]?.textContent?.trim() || titleEl.textContent?.trim();
    let yearEl = document.querySelector('.year') || titleEl.parentElement?.querySelector('.secondary');
    let year = yearEl?.textContent?.match(/\d{4}/)?.[0];

    const type = window.location.href.includes('/shows/') ? 'series' : 'movie';

    if (!title) return;

    const btnText = getBtnText(action);
    const iconUrl = chrome.runtime.getURL('icons/stremio-icon.png');

    const stremioButton = document.createElement('a');
    stremioButton.id = 'stremio-hub-btn';
    if (currentLang === 'ar') stremioButton.classList.add('stremio-ar');
    stremioButton.title = btnText;
    stremioButton.innerHTML = `<img alt="${btnText}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover; transition: all 0.3s ease; box-shadow: 0 4px 10px rgba(0,0,0,0.3);" src="${iconUrl}"/>`;

    if (currentLang === 'ar') {
      stremioButton.setAttribute('style', 'margin-right: 12px; margin-left: 12px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;');
      stremioButton.style.fontFamily = "'Thmanyah', system-ui, -apple-system, sans-serif";
    } else {
      stremioButton.setAttribute('style', 'margin-left: 12px; margin-right: 12px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; vertical-align: middle;');
    }

    const img = stremioButton.querySelector('img');

    stremioButton.addEventListener('mouseenter', () => img.style.transform = 'scale(1.1)');
    stremioButton.addEventListener('mouseleave', () => img.style.transform = 'scale(1)');

    const showFeedback = (res) => {
      const isSuccess = res && res.success;
      if (isSuccess && res.itemMeta && typeof showStremioHubToast === 'function') {
        showStremioHubToast(res.itemMeta);
      }
      const color = isSuccess ? '#34d399' : '#f87171';
      img.style.boxShadow = `0 0 0 3px ${color}, 0 4px 12px ${color}80`;
      img.style.transform = 'scale(1.1)';
      setTimeout(() => {
        img.style.boxShadow = '0 4px 10px rgba(0,0,0,0.3)';
        img.style.transform = 'scale(1)';
      }, 3000);
    };

    stremioButton.addEventListener('click', async (e) => {
      e.preventDefault();

      if (action === 'open') {
        chrome.runtime.sendMessage({ type: 'OPEN_IN_STREMIO_DIRECT', query: title, year, mediaType: type }, (res) => {
          showFeedback(res);
        });
        return;
      }

      const stored = await chrome.storage.local.get('autoSave');
      const autoSave = stored.autoSave !== false;

      if (autoSave) {
        chrome.runtime.sendMessage({ type: 'ADD_TO_LIBRARY', query: title, year, mediaType: type }, (res) => {
          showFeedback(res);
        });
      } else {
        chrome.runtime.sendMessage({ type: 'SEARCH_IN_POPUP', query: title, year, mediaType: type });
      }
    });

    // Append directly to the h1 so it stays right next to the movie/show title permanently
    titleEl.style.display = 'inline-flex';
    titleEl.style.alignItems = 'center';
    titleEl.style.flexWrap = 'wrap';
    titleEl.appendChild(stremioButton);
  }

  // ==================== Standard Button Factory ====================

  function insertStremioButton(targetEl, title, year, type, position, action = 'save') {
    if (!targetEl || !title) return;
    if (document.getElementById('stremio-hub-btn')) return;

    const iconUrl = chrome.runtime.getURL('icons/stremio-icon.png');
    const btnText = getBtnText(action);

    const wrapper = document.createElement('div');
    wrapper.id = 'stremio-hub-btn';
    wrapper.setAttribute('role', 'button');
    wrapper.setAttribute('tabindex', '0');
    wrapper.setAttribute('aria-label', `${btnText} - ${title}`);
    if (currentLang === 'ar') wrapper.classList.add('stremio-ar');

    
    wrapper.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: rgba(20, 20, 25, 0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(123, 94, 167, 0.4);
      color: white;
      padding: 8px 16px 8px 10px;
      border-radius: 12px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      margin: 10px 0;
      transition: all 0.2s ease;
      text-decoration: none;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      box-shadow: 0 4px 12px rgba(123, 94, 167, 0.2);
      user-select: none;
      position: relative;
      z-index: 1000;
    `;
    if (currentLang === 'ar') {
      wrapper.style.fontFamily = "'Thmanyah', system-ui, -apple-system, sans-serif";
    }


    wrapper.innerHTML = `
      <img src="${iconUrl}" style="width: 24px; height: 24px; border-radius: 6px; object-fit: cover; box-shadow: 0 2px 6px rgba(0,0,0,0.3);" alt="Stremio">
      <span>${btnText}</span>
    `;

    // Hover effects
    wrapper.addEventListener('mouseenter', () => {
      wrapper.style.transform = 'translateY(-2px)';
      wrapper.style.boxShadow = '0 6px 16px rgba(123, 94, 167, 0.35)';
      wrapper.style.background = 'rgba(25, 25, 30, 0.95)';
    });
    wrapper.addEventListener('mouseleave', () => {
      wrapper.style.transform = '';
      wrapper.style.boxShadow = '0 4px 12px rgba(123, 94, 167, 0.2)';
      wrapper.style.background = 'rgba(20, 20, 25, 0.85)';
    });

    // Click handler
    const handleAction = async () => {
      const span = wrapper.querySelector('span');

      if (action === 'open') {
        span.textContent = getStatusText('opening');
        chrome.runtime.sendMessage({ type: 'OPEN_IN_STREMIO_DIRECT', query: title, year, mediaType: type }, (res) => {
          if (res && res.success) {
            if (res.itemMeta && typeof showStremioHubToast === 'function') showStremioHubToast(res.itemMeta);
            span.textContent = getStatusText('opened');
          } else {
            span.textContent = getStatusText('failed');
          }
          setTimeout(() => span.textContent = btnText, 3000);
        });
        return;
      }

      const stored = await chrome.storage.local.get('autoSave');
      const autoSave = stored.autoSave !== false;

      if (autoSave) {
        span.textContent = getStatusText('saving');

        chrome.runtime.sendMessage({
          type: 'ADD_TO_LIBRARY',
          query: title,
          year,
          mediaType: type
        }, (res) => {
          if (res && res.success) {
            if (res.itemMeta && typeof showStremioHubToast === 'function') showStremioHubToast(res.itemMeta);
            span.textContent = getStatusText('saved');
            span.style.color = '#34d399';
            wrapper.style.borderColor = '#34d399';
          } else {
            span.textContent = getStatusText('failed');
            span.style.color = '#f87171';
          }
          setTimeout(() => {
            span.textContent = btnText;
            span.style.color = 'white';
            wrapper.style.borderColor = 'rgba(123, 94, 167, 0.4)';
          }, 3000);
        });
      } else {
        span.textContent = getStatusText('loading');
        chrome.runtime.sendMessage({
          type: 'SEARCH_IN_POPUP',
          query: title,
          year,
          mediaType: type
        });
        setTimeout(() => {
          span.textContent = btnText;
        }, 2000);
      }
    };

    wrapper.addEventListener('click', handleAction);
    wrapper.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleAction();
      }
    });

    switch (position) {
      case 'prepend': targetEl.prepend(wrapper); break;
      case 'append': targetEl.append(wrapper); break;
      case 'after': targetEl.after(wrapper); break;
    }
  }

  // ==================== Run ====================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Observer for dynamically loaded content (specifically useful for Google Search and SPAs)
  let observerTimer = null;
  const observer = new MutationObserver(() => {
    // If button already exists, skip
    if (document.getElementById('stremio-hub-btn') || document.getElementById('stremio-google-btn')) return;
    // Debounce: wait 150ms to batch rapid DOM mutations before re-injecting
    clearTimeout(observerTimer);
    observerTimer = setTimeout(init, 150);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Disconnect the observer after 10 seconds for static sites to save resources.
  // Keep it running for SPAs (like Metacritic, TMDB, Letterboxd) to handle client-side navigation.
  const isSPA = hostname.includes('metacritic.com') || hostname.includes('themoviedb.org') || hostname.includes('letterboxd.com') || hostname.includes('rottentomatoes.com') || hostname.includes('trakt.tv');
  if (!isSPA) {
    setTimeout(() => observer.disconnect(), 10000);
  }

  function showStremioHubToast(meta) {
    if (!meta) return;

    chrome.storage.local.get({
      toastEnabled: true,
      toastPosition: 'bottom-right',
      language: 'ar'
    }, (settings) => {
      if (settings.toastEnabled === false) return;

      let toastShown = false;
      const displayToast = () => {
        if (toastShown) return;
        toastShown = true;

        // Create the host for the shadow DOM
        const host = document.createElement('div');
        host.id = 'stremio-hub-toast-host';
        host.style.cssText = 'position: fixed; z-index: 2147483647; top: 0; left: 0; width: 0; height: 0; overflow: visible; pointer-events: none;';

        // Attach Shadow DOM
        const shadow = host.attachShadow({ mode: 'closed' });

        // Build the styles
        const pos = settings.toastPosition || 'bottom-right';
        let positionStyles = '';
        let initialTransform = 'translateY(150%) scale(0.9)';
        let exitTransform = 'translateY(150%) scale(0.9)';

        if (pos === 'top-right') {
          positionStyles = 'top: 24px; right: 24px;';
          initialTransform = 'translateY(-150%) scale(0.9)';
          exitTransform = 'translateY(-150%) scale(0.9)';
        } else if (pos === 'top-left') {
          positionStyles = 'top: 24px; left: 24px;';
          initialTransform = 'translateY(-150%) scale(0.9)';
          exitTransform = 'translateY(-150%) scale(0.9)';
        } else if (pos === 'bottom-left') {
          positionStyles = 'bottom: 24px; left: 24px;';
          initialTransform = 'translateY(150%) scale(0.9)';
          exitTransform = 'translateY(150%) scale(0.9)';
        } else {
          // bottom-right
          positionStyles = 'bottom: 24px; right: 24px;';
          initialTransform = 'translateY(150%) scale(0.9)';
          exitTransform = 'translateY(150%) scale(0.9)';
        }

        // Inject font-face into document.head if not already present
        if (!document.getElementById('stremio-hub-fonts')) {
          const fontStyle = document.createElement('style');
          fontStyle.id = 'stremio-hub-fonts';
          fontStyle.textContent = `
            @font-face {
              font-family: 'Thmanyah';
              src: url('${chrome.runtime.getURL('fonts/thmanyahsans-Regular.woff2')}') format('woff2');
              font-weight: normal;
              font-style: normal;
            }
            @font-face {
              font-family: 'Thmanyah';
              src: url('${chrome.runtime.getURL('fonts/thmanyahsans-Bold.woff2')}') format('woff2');
              font-weight: bold;
              font-style: normal;
            }
          `;
          document.head.appendChild(fontStyle);
        }

        const isAr = settings.language === 'ar';
        const successMsg = isAr ? 'تم الحفظ بنجاح' : 'Saved successfully';
        const unknownTitle = isAr ? 'عنوان غير معروف' : 'Unknown title';

        // Add styles for the toast inside the shadow root
        const style = document.createElement('style');
        style.textContent = `
          .toast-container {
            position: fixed;
            ${positionStyles}
            background: rgba(31, 41, 55, 0.95);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(123, 94, 167, 0.5);
            border-radius: 12px;
            color: #fff;
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 14px;
            box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5), 0 0 15px rgba(123, 94, 167, 0.3);
            font-family: 'Thmanyah', system-ui, -apple-system, sans-serif;
            transform: ${initialTransform};
            opacity: 0;
            transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
            direction: ${isAr ? 'rtl' : 'ltr'};
            min-width: 260px;
            max-width: 350px;
            pointer-events: auto;
          }
          .toast-container.show {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          .poster {
            width: 44px;
            height: 66px;
            object-fit: cover;
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            opacity: 0;
            transition: opacity 0.3s ease-in-out;
          }
          .poster.loaded {
            opacity: 1;
          }
          .poster-placeholder {
            width: 44px;
            height: 66px;
            background: #2a2a32;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 20px;
          }
          .content {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .success-msg {
            font-size: 13px;
            color: #34d399;
            font-weight: bold;
            margin-bottom: 4px;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .title {
            font-size: 15px;
            font-weight: bold;
            line-height: 1.3;
            overflow: hidden;
            text-overflow: ellipsis;
            display: -webkit-box;
            -webkit-line-clamp: 2;
            -webkit-box-orient: vertical;
          }
          .year {
            color: #9ca3af;
            font-size: 12px;
            margin-inline-start: 6px;
            font-weight: normal;
          }
        `;
        shadow.appendChild(style);

        const toast = document.createElement('div');
        toast.className = 'toast-container';

        const imgHtml = meta.poster
          ? `<img src="${meta.poster}" class="poster" onload="this.classList.add('loaded')">`
          : `<div class="poster-placeholder">📺</div>`;

        const yearHtml = meta.year ? `<span class="year">(${meta.year})</span>` : '';

        toast.innerHTML = `
          ${imgHtml}
          <div class="content">
            <div class="success-msg">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              ${successMsg}
            </div>
            <div class="title">
              ${meta.name || unknownTitle} ${yearHtml}
            </div>
          </div>
        `;

        shadow.appendChild(toast);
        document.body.appendChild(host);

        // Trigger entrance animation
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            toast.classList.add('show');
          });
        });

        // Trigger exit animation and cleanup
        setTimeout(() => {
          toast.classList.remove('show');
          toast.style.transform = exitTransform; // force exit direction
          setTimeout(() => host.remove(), 500); // wait for animation to end
        }, 4000);
      };

      if (meta.poster) {
        const img = new Image();
        img.onload = img.onerror = displayToast;
        img.src = meta.poster;
        // fallback display after 250ms
        setTimeout(displayToast, 250);
      } else {
        displayToast();
      }
    });
  }

})();
