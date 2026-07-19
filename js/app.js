/* موقع القلعة الخضراء — النادي الأهلي السعودي */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const AHLI_ID = "8346";
  // الشعار الجديد (هوية 2025) — شعار ESPN قديم
  const AHLI_LOGO = "https://upload.wikimedia.org/wikipedia/ar/thumb/3/3e/Al-Ahli_SFC_%282025%29.svg/langar-330px-Al-Ahli_SFC_%282025%29.svg.png";
  const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/ksa.1";
  const ESPN_STANDINGS = "https://site.api.espn.com/apis/v2/sports/soccer/ksa.1/standings";

  /* ================= التنقل ================= */
  const navToggle = $("#navToggle");
  const mainnav = $("#mainnav");
  navToggle.addEventListener("click", () => mainnav.classList.toggle("open"));

  $$("[data-nav]").forEach((link) =>
    link.addEventListener("click", () => {
      $$(".nav-link").forEach((l) => l.classList.remove("active"));
      const active = $(`.nav-link[data-nav="${link.dataset.nav}"]`);
      if (active) active.classList.add("active");
      mainnav.classList.remove("open");
    })
  );

  /* ================= أدوات ================= */
  async function loadJSON(path) {
    const res = await fetch(path + (path.includes("?") ? "&" : "?") + "v=" + Date.now());
    if (!res.ok) throw new Error("فشل تحميل " + path);
    return res.json();
  }

  async function fetchWithTimeout(url, ms = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  function formatDate(d) {
    if (!d) return "";
    const date = new Date(d);
    if (isNaN(date)) return d;
    return date.toLocaleDateString("ar-SA", { year: "numeric", month: "long", day: "numeric" });
  }

  function timeAgo(d) {
    const date = new Date(d);
    if (isNaN(date)) return "";
    const mins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return "الآن";
    if (mins < 60) return `قبل ${mins} دقيقة`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `قبل ${hrs} ساعة`;
    return `قبل ${Math.floor(hrs / 24)} يوم`;
  }

  function escapeHTML(s) {
    const div = document.createElement("div");
    div.textContent = s == null ? "" : String(s);
    return div.innerHTML;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ================= الأخبار ================= */
  const NEWS_QUERY = encodeURIComponent('"النادي الأهلي السعودي" OR "الأهلي السعودي"');
  const RSS_URL = `https://news.google.com/rss/search?q=${NEWS_QUERY}&hl=ar&gl=SA&ceid=SA:ar`;
  const PROXIES = [
    (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  ];

  const newsGrid = $("#newsGrid");
  const lastUpdated = $("#lastUpdated");

  function renderNews(items, updatedAt, live) {
    if (items && items.length) window.__chatNews = items;
    if (!items || !items.length) {
      newsGrid.innerHTML = '<div class="loader">لا توجد أخبار حاليًا — حاول التحديث بعد قليل.</div>';
      return;
    }
    newsGrid.innerHTML = items
      .slice(0, 12)
      .map(
        (n) => `
      <article class="news-card">
        <h3><a href="${escapeHTML(n.link)}" target="_blank" rel="noopener">${escapeHTML(n.title)}</a></h3>
        <div class="news-meta">
          <span class="news-source">${escapeHTML(n.source || "خبر")}</span>
          <span>${escapeHTML(timeAgo(n.date) || formatDate(n.date))}</span>
        </div>
      </article>`
      )
      .join("");
    const when = updatedAt ? timeAgo(updatedAt) || formatDate(updatedAt) : "";
    lastUpdated.textContent = live
      ? "⟳ الأخبار محدثة لحظيًا (آخر تحديث: الآن)"
      : `⟳ آخر تحديث تلقائي للأخبار: ${when || "قريبًا"}`;
  }

  function parseRSS(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    return [...doc.querySelectorAll("item")].map((item) => {
      let title = item.querySelector("title")?.textContent || "";
      let source = item.querySelector("source")?.textContent || "";
      const idx = title.lastIndexOf(" - ");
      if (idx > 10) {
        if (!source) source = title.slice(idx + 3);
        title = title.slice(0, idx);
      }
      return {
        title,
        source,
        link: item.querySelector("link")?.textContent || "#",
        date: item.querySelector("pubDate")?.textContent || "",
      };
    });
  }

  async function fetchLiveNews() {
    for (const proxy of PROXIES) {
      try {
        const res = await fetchWithTimeout(proxy(RSS_URL));
        if (!res.ok) continue;
        const items = parseRSS(await res.text());
        if (items.length) return items;
      } catch (_) {
        /* جرّب الوسيط التالي */
      }
    }
    return null;
  }

  async function loadNews() {
    try {
      const data = await loadJSON("data/news.json");
      renderNews(data.items, data.updatedAt, false);
    } catch (_) {
      /* الجلب اللحظي أدناه */
    }
    const live = await fetchLiveNews();
    if (live) {
      renderNews(live, new Date().toISOString(), true);
    } else if (!newsGrid.querySelector(".news-card")) {
      newsGrid.innerHTML = '<div class="loader">تعذّر تحميل الأخبار حاليًا — حاول لاحقًا.</div>';
    }
  }

  $("#refreshNews").addEventListener("click", () => {
    newsGrid.innerHTML = '<div class="loader">جارٍ التحديث…</div>';
    loadNews();
  });
  setInterval(loadNews, 10 * 60 * 1000);

  /* ================= الفريق الأول ================= */
  const playersGrid = $("#playersGrid");
  const modal = $("#playerModal");
  const modalCard = $("#playerModalCard");
  let allPlayers = [];

  const STAT_KEYS_OUT = ["السرعة", "التسديد", "التمرير", "المراوغة", "الدفاع", "القوة البدنية"];
  const STAT_KEYS_GK = ["الانعكاسات", "التمركز", "الشجاعة", "اللعب بالقدم", "الكرات العالية", "ركلات الجزاء"];

  // تقييمات تقديرية ثابتة لكل لاعب ليس له تقييم يدوي (مشتقة من رقم اللاعب)
  function pseudoStats(p) {
    const seed = parseInt(p.id, 10) || 1;
    const rand = (n) => 58 + ((seed * 37 + n * 101) % 20); // بين 58 و77
    const keys = p.position === "GK" ? STAT_KEYS_GK : STAT_KEYS_OUT;
    const stats = {};
    keys.forEach((k, i) => (stats[k] = rand(i)));
    return stats;
  }

  function displayName(p) {
    return p.ar || p.name;
  }

  function initials(p) {
    return displayName(p).split(" ").slice(0, 2).map((w) => w[0]).join(" ");
  }

  function renderCoach(coach) {
    if (!coach || !coach.name) return;
    $("#coachCard").innerHTML = `
      <div class="coach-card">
        ${coach.photo ? `<img class="coach-photo" src="${escapeHTML(coach.photo)}" alt="${escapeHTML(coach.name)}" onerror="this.remove()">` : ""}
        <div class="coach-info">
          <div class="label">المدير الفني</div>
          <div class="name">${escapeHTML(coach.name)}</div>
          <div class="nat">🇩🇪 ${escapeHTML(coach.nationality || "")}</div>
        </div>
      </div>`;
  }

  let clubData = { coach: null, departed: [] };

  async function loadPlayers() {
    try {
      const [squad, meta, team] = await Promise.all([
        loadJSON("data/squad.json"),
        loadJSON("data/players.json"),
        loadJSON("data/team.json").catch(() => ({})),
      ]);
      const overlay = meta.overlay || {};
      clubData.departed = meta.departed || [];
      clubData.coach = { ...(meta.coach || {}), ...(team.coach || {}) };
      renderCoach(clubData.coach);
      const departedSet = new Set(clubData.departed);
      allPlayers = (squad.players || [])
        .filter((p) => !departedSet.has(p.name))
        .map((p) => {
          const extra = overlay[p.name] || {};
          return {
            ...p,
            ar: extra.ar,
            rating: extra.rating || null,
            stats: extra.stats || null,
            bio: extra.bio || null,
          };
        });
      // ترتيب: حراسة ثم دفاع ثم وسط ثم هجوم، وبداخلها أصحاب التقييم أولًا
      const order = { GK: 0, DF: 1, MF: 2, FW: 3 };
      allPlayers.sort((a, b) => (order[a.position] ?? 9) - (order[b.position] ?? 9) || (b.rating || 0) - (a.rating || 0));
      renderPlayers();
    } catch (_) {
      playersGrid.innerHTML = '<div class="loader">تعذّر تحميل بيانات الفريق.</div>';
    }
  }

  function renderPlayers(filter = "all") {
    const list = filter === "all" ? allPlayers : allPlayers.filter((p) => p.position === filter);
    playersGrid.innerHTML = list
      .map(
        (p) => `
      <div class="player-card" data-idx="${allPlayers.indexOf(p)}">
        <div class="pc-top">
          <span class="pc-num">${escapeHTML(p.jersey || "-")}</span>
          <span class="pc-pos">${escapeHTML(p.roleAr || p.position)}</span>
        </div>
        <div class="pc-avatar">${escapeHTML(initials(p))}
          ${p.photo ? `<img class="pc-photo" src="${escapeHTML(p.photo)}" alt="${escapeHTML(displayName(p))}" loading="lazy" onerror="this.remove()">` : ""}
          ${p.flag ? `<img class="pc-flag" src="${escapeHTML(p.flag)}" alt="${escapeHTML(p.nationalityAr || "")}" loading="lazy" onerror="this.remove()">` : ""}
        </div>
        <div class="pc-name">${escapeHTML(displayName(p))}</div>
        <div class="pc-country">${escapeHTML(p.nationalityAr || p.nationality || "")}${p.age ? ` · ${p.age} سنة` : ""}</div>
        <div class="pc-rating">${p.rating ? `⭐ التقييم العام: ${p.rating}` : "🌱 لاعب صاعد"}</div>
      </div>`
      )
      .join("") || '<div class="loader">لا يوجد لاعبون في هذا المركز.</div>';

    $$(".player-card", playersGrid).forEach((card) =>
      card.addEventListener("click", () => openPlayer(allPlayers[+card.dataset.idx]))
    );
  }

  function statClass(v) {
    if (v >= 85) return "top";
    if (v >= 75) return "high";
    return "";
  }

  function openPlayer(p) {
    const stats = p.stats || pseudoStats(p);
    const estimated = !p.stats;
    modalCard.innerHTML = `
      <button class="pm-close" data-close>✕</button>
      <div class="pm-head">
        <div class="pm-avatar">${escapeHTML(p.jersey || "-")}${p.photo ? `<img src="${escapeHTML(p.photo)}" alt="" onerror="this.remove()">` : ""}</div>
        <div>
          <h3>${escapeHTML(displayName(p))}</h3>
          <p>${escapeHTML(p.roleAr || "")} · ${escapeHTML(p.nationalityAr || p.nationality || "")}
            ${p.flag ? `<img src="${escapeHTML(p.flag)}" alt="" style="width:18px;height:18px;border-radius:50%;vertical-align:middle;margin-inline-start:4px">` : ""}
          </p>
        </div>
      </div>
      <div class="pm-info">
        <div><b>${p.rating ? p.rating : "—"}</b><span>التقييم العام</span></div>
        <div><b>${p.age ?? "—"}</b><span>العمر</span></div>
        <div><b>${escapeHTML(p.height || "—")}</b><span>الطول</span></div>
      </div>
      <div class="pm-stats">
        ${Object.entries(stats)
          .map(
            ([k, v]) => `
          <div class="stat-row">
            <span>${escapeHTML(k)}</span>
            <div class="stat-bar"><div class="stat-fill ${statClass(v)}" style="width:${v}%"></div></div>
            <span class="stat-val">${v}</span>
          </div>`
          )
          .join("")}
      </div>
      ${estimated ? '<div class="pm-bio">📊 تقييمات تقديرية أولية — تُحدَّث يدويًا للاعبين الأساسيين.</div>' : ""}
      ${p.bio ? `<div class="pm-bio">${escapeHTML(p.bio)}</div>` : ""}
    `;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
  }

  modal.addEventListener("click", (e) => {
    if (e.target.matches("[data-close]")) {
      modal.hidden = true;
      document.body.style.overflow = "";
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.hidden) {
      modal.hidden = true;
      document.body.style.overflow = "";
    }
  });

  $("#posFilters").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    $$("#posFilters .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    renderPlayers(chip.dataset.pos);
  });

  /* ================= المباريات ================= */
  function teamHTML(side, away) {
    return `<span class="t ${away ? "away" : ""}">
      ${side.logo ? `<img src="${escapeHTML(side.logo)}" alt="" loading="lazy">` : ""}
      <span>${escapeHTML(side.nameAr || side.name)}</span>
    </span>`;
  }

  function ahliOutcome(m) {
    const ahliHome = m.home.name === "Al Ahli" || m.home.nameAr === "الأهلي";
    const us = ahliHome ? m.home : m.away;
    const them = ahliHome ? m.away : m.home;
    const a = parseInt(us.score, 10);
    const b = parseInt(them.score, 10);
    if (isNaN(a) || isNaN(b)) return "draw";
    return a > b ? "win" : a < b ? "loss" : "draw";
  }

  function renderMatches(data) {
    window.__chatMatches = data;
    const upcoming = $("#upcomingList");
    const results = $("#resultsList");

    upcoming.innerHTML =
      (data.upcoming || [])
        .slice(0, 6)
        .map(
          (m) => `
      <div class="match-card">
        <div class="match-comp">${escapeHTML(m.competition)}</div>
        <div class="match-row">
          ${teamHTML(m.home, false)}
          <span class="match-score">VS</span>
          ${teamHTML(m.away, true)}
        </div>
        <div class="match-date">🗓️ ${formatDate(m.date)}</div>
      </div>`
        )
        .join("") ||
      '<div class="match-card">لا توجد مباريات مجدولة حاليًا — تُضاف تلقائيًا فور اعتماد جدول الموسم الجديد 📋</div>';

    results.innerHTML =
      (data.results || [])
        .slice(0, 6)
        .map(
          (m) => `
      <div class="match-card">
        <div class="match-comp">${escapeHTML(m.competition)}</div>
        <div class="match-row">
          ${teamHTML(m.home, false)}
          <span class="match-score ${ahliOutcome(m)}">${escapeHTML(m.home.score)} - ${escapeHTML(m.away.score)}</span>
          ${teamHTML(m.away, true)}
        </div>
        <div class="match-date">${formatDate(m.date)}</div>
      </div>`
        )
        .join("") || '<div class="match-card">لا توجد نتائج مسجلة.</div>';

    renderNextMatchCard(data);
  }

  function renderNextMatchCard(data) {
    const card = $("#nextMatchCard");
    const next = (data.upcoming || []).find((m) => m.date && new Date(m.date) > new Date());

    if (!next) {
      card.innerHTML = `
        <div class="nm-title">🏆 آخر إنجازات الملكي</div>
        <div class="nm-teams">
          <div class="nm-team"><div class="logo">🌏</div><div class="name">بطل آسيا 2025</div></div>
          <span class="nm-vs">+</span>
          <div class="nm-team"><div class="logo">🌏</div><div class="name">بطل آسيا 2026</div></div>
        </div>
        <div class="nm-meta">نسختان متتاليتان من دوري أبطال آسيا للنخبة — سيظهر العد التنازلي للمباراة القادمة هنا تلقائيًا</div>`;
      return;
    }

    const logoOr = (side) =>
      side.logo
        ? `<img class="logo" src="${escapeHTML(side.logo)}" alt="">`
        : '<div class="logo">⚽</div>';

    card.innerHTML = `
      <div class="nm-title">⏳ المباراة القادمة — ${escapeHTML(next.competition)}</div>
      <div class="nm-teams">
        <div class="nm-team">${logoOr(next.home)}<div class="name">${escapeHTML(next.home.nameAr || next.home.name)}</div></div>
        <span class="nm-vs">VS</span>
        <div class="nm-team">${logoOr(next.away)}<div class="name">${escapeHTML(next.away.nameAr || next.away.name)}</div></div>
      </div>
      <div class="nm-countdown" id="countdown"></div>
      <div class="nm-meta">🗓️ ${formatDate(next.date)}</div>`;

    const cd = $("#countdown");
    (function tick() {
      const diff = new Date(next.date) - new Date();
      if (diff <= 0) {
        cd.innerHTML = "<b>انطلقت المباراة! 🔥</b>";
        return;
      }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      cd.innerHTML = `
        <div class="cd"><b>${d}</b><span>يوم</span></div>
        <div class="cd"><b>${h}</b><span>ساعة</span></div>
        <div class="cd"><b>${m}</b><span>دقيقة</span></div>
        <div class="cd"><b>${s}</b><span>ثانية</span></div>`;
      setTimeout(tick, 1000);
    })();
  }

  // أسماء الأندية بالعربية للجلب اللحظي من ESPN
  const AR_TEAMS = {
    "Al Ahli": "الأهلي", "Al Ettifaq": "الاتفاق", "Al Fateh": "الفتح", "Al Fayha": "الفيحاء",
    "Al Hazem": "الحزم", "Al Hilal": "الهلال", "Al Ittihad": "الاتحاد", "Al Khaleej": "الخليج",
    "Al Kholood": "الخلود", "Al Najma": "النجمة", "Al Nassr": "النصر", "Al Okhdood": "الأخدود",
    "Al Qadsiah": "القادسية", "Al Riyadh": "الرياض", "Al Shabab": "الشباب", "Al Taawoun": "التعاون",
    "Damac": "ضمك", "Neom SC": "نيوم",
  };
  const arTeam = (n) => AR_TEAMS[n] || n;

  const teamLogo = (name, fallback) => (name === "Al Ahli" ? AHLI_LOGO : fallback);

  function espnSide(competitor) {
    const team = competitor.team || {};
    const score = competitor.score;
    const name = team.displayName || "";
    return {
      name,
      nameAr: arTeam(name),
      logo: teamLogo(name, (team.logos && team.logos[0] && team.logos[0].href) || team.logo || ""),
      score: typeof score === "object" && score !== null ? score.displayValue || "" : String(score ?? ""),
    };
  }

  async function fetchLiveMatches() {
    const res = await fetchWithTimeout(`${ESPN}/teams/${AHLI_ID}/schedule`);
    if (!res.ok) throw new Error("espn schedule");
    const d = await res.json();
    const upcoming = [], results = [];
    for (const e of d.events || []) {
      const comp = e.competitions?.[0];
      if (!comp) continue;
      const state = comp.status?.type?.state || "";
      let compName = e.league?.name || "";
      if (!compName || compName.includes("Saudi Pro League")) compName = "دوري روشن السعودي";
      else if (compName.includes("King") && compName.includes("Cup")) compName = "كأس خادم الحرمين الشريفين";
      const match = { date: e.date, competition: compName };
      for (const c of comp.competitors || []) {
        match[c.homeAway === "home" ? "home" : "away"] = espnSide(c);
      }
      if (!match.home || !match.away) continue;
      (state === "post" ? results : upcoming).push(match);
    }
    upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
    results.sort((a, b) => new Date(b.date) - new Date(a.date));
    return { upcoming, results };
  }

  async function loadMatches() {
    // النسخة المخزنة تلقائيًا أولًا (فورية)، ثم الترقية للجلب اللحظي من ESPN
    try {
      renderMatches(await loadJSON("data/matches_auto.json"));
    } catch (_) {
      renderMatches({ upcoming: [], results: [] });
    }
    try {
      renderMatches(await fetchLiveMatches());
    } catch (_) {
      /* نكتفي بالنسخة المخزنة */
    }
  }

  /* ================= الترتيب ================= */
  function renderStandings(data) {
    if (data.entries && data.entries.length) window.__chatStandings = data.entries;
    const tbody = $("#standingsTable tbody");
    if (!data.entries || !data.entries.length) {
      tbody.innerHTML = '<tr><td colspan="8">جدول الترتيب غير متاح حاليًا — يظهر تلقائيًا مع انطلاق الموسم.</td></tr>';
      return;
    }
    $("#standingsSeason").textContent = data.seasonName
      ? `موسم ${data.seasonName} — يتحدث تلقائيًا`
      : "يتحدث تلقائيًا";
    tbody.innerHTML = data.entries
      .map(
        (e, i) => `
      <tr class="${e.team === "Al Ahli" ? "ahli" : ""}">
        <td>${i + 1}</td>
        <td class="team-col"><span class="team-cell">
          ${e.logo ? `<img src="${escapeHTML(e.logo)}" alt="" loading="lazy">` : ""}${escapeHTML(e.teamAr || e.team)}
        </span></td>
        <td>${escapeHTML(e.played)}</td>
        <td>${escapeHTML(e.wins)}</td>
        <td>${escapeHTML(e.draws)}</td>
        <td>${escapeHTML(e.losses)}</td>
        <td>${escapeHTML(e.goalDiff)}</td>
        <td class="pts">${escapeHTML(e.points)}</td>
      </tr>`
      )
      .join("");
  }

  async function fetchLiveStandings() {
    const res = await fetchWithTimeout(ESPN_STANDINGS);
    if (!res.ok) throw new Error("espn standings");
    const d = await res.json();
    const entries = (d.children?.[0]?.standings?.entries || []).map((entry) => {
      const stats = {};
      for (const s of entry.stats || []) stats[s.name] = s.displayValue || "";
      const teamName = entry.team?.displayName || "";
      return {
        team: teamName,
        teamAr: arTeam(teamName),
        logo: teamLogo(teamName, entry.team?.logos?.[0]?.href || ""),
        played: stats.gamesPlayed || "",
        wins: stats.wins || "",
        draws: stats.ties || "",
        losses: stats.losses || "",
        goalDiff: stats.pointDifferential || "",
        points: stats.points || "",
      };
    });
    entries.sort((a, b) => (parseInt(b.points, 10) || 0) - (parseInt(a.points, 10) || 0));
    return { seasonName: d.season?.displayName || "", entries };
  }

  async function loadStandings() {
    // النسخة المخزنة أولًا، ثم الترقية للجلب اللحظي
    try {
      renderStandings(await loadJSON("data/standings.json"));
    } catch (_) {
      renderStandings({ entries: [] });
    }
    try {
      renderStandings(await fetchLiveStandings());
    } catch (_) {
      /* نكتفي بالنسخة المخزنة */
    }
  }

  /* ================= الألعاب ================= */
  const gameArea = $("#gameArea");

  const QUIZ = [
    { q: "في أي عام تأسس النادي الأهلي السعودي؟", opts: ["1937", "1945", "1927", "1953"], a: 0 },
    { q: "ما لقب النادي الأهلي الأشهر؟", opts: ["الملكي", "الزعيم", "العميد", "الفارس"], a: 0 },
    { q: "كم نسخة متتالية حقق الأهلي من دوري أبطال آسيا للنخبة؟", opts: ["نسختان (2025 و2026)", "نسخة واحدة (2025)", "ثلاث نسخ", "لم يحققها"], a: 0 },
    { q: "من سجّل هدف نهائي دوري أبطال آسيا للنخبة 2026 أمام ماتشيدا زيلفيا؟", opts: ["فراس البريكان", "إيفان توني", "غالينو", "إنزو ميو"], a: 0 },
    { q: "على أي ملعب يلعب الأهلي مبارياته؟", opts: ["الجوهرة المشعة (الإنماء)", "ملعب الملك فهد", "مرسول بارك", "ملعب الأمير عبدالله الفيصل"], a: 0 },
    { q: "كم بطولة دوري سعودي للأهلي وفق لجنة توثيق البطولات؟", opts: ["9 بطولات", "3 بطولات", "5 بطولات", "12 بطولة"], a: 0 },
    { q: "كم مرة حقق الأهلي كأس الملك وفق لجنة التوثيق؟", opts: ["8 مرات", "13 مرة", "5 مرات", "10 مرات"], a: 0 },
    { q: "كم إجمالي البطولات الرسمية للأهلي وفق التقرير النهائي للجنة التوثيق؟", opts: ["53 بطولة", "43 بطولة", "60 بطولة", "35 بطولة"], a: 0 },
    { q: "في أي مدينة يقع النادي الأهلي؟", opts: ["جدة", "الرياض", "الدمام", "مكة المكرمة"], a: 0 },
    { q: "من هو حارس مرمى الأهلي الأول؟", opts: ["إدوارد ميندي", "محمد العويس", "ياسين بونو", "عبدالله المعيوف"], a: 0 },
    { q: "من أي نادٍ انتقل فرانشيسكو ترينكاو إلى الأهلي صيف 2026؟", opts: ["سبورتينغ لشبونة", "برشلونة", "بورتو", "بنفيكا"], a: 0 },
    { q: "متى دشّن الأهلي شعاره وهويته الجديدة؟", opts: ["يوليو 2025", "يناير 2024", "سبتمبر 2026", "مارس 2023"], a: 0 },
  ];

  function gameIntro(title, desc, startLabel, onStart) {
    gameArea.innerHTML = `
      <div class="game-intro">
        <h3>${title}</h3>
        <p>${desc}</p>
        <button class="btn btn-primary" id="gameStart">${startLabel}</button>
      </div>`;
    $("#gameStart").addEventListener("click", onStart);
  }

  function gameResult(emoji, title, sub, onRetry) {
    gameArea.innerHTML = `
      <div class="game-result">
        <div class="big">${emoji}</div>
        <h3>${title}</h3>
        <p>${sub}</p>
        <br>
        <button class="btn btn-primary" id="gameRetry">العب من جديد 🔄</button>
      </div>`;
    $("#gameRetry").addEventListener("click", onRetry);
  }

  /* --- اختبار أهلاوي --- */
  function startQuiz() {
    const questions = shuffle(QUIZ).map((q) => {
      const opts = shuffle(q.opts.map((text, i) => ({ text, correct: i === q.a })));
      return { q: q.q, opts };
    });
    let idx = 0, score = 0;

    function showQ() {
      if (idx >= questions.length) {
        const pct = score / questions.length;
        const emoji = pct === 1 ? "👑" : pct >= 0.7 ? "💚" : pct >= 0.4 ? "🙂" : "😅";
        const verdict = pct === 1 ? "أهلاوي ذهبي أصيل!" : pct >= 0.7 ? "أهلاوي حقيقي!" : pct >= 0.4 ? "لا بأس.. راجع تاريخ الملكي" : "تحتاج دورة مكثفة في الأهلاوية!";
        gameResult(emoji, verdict, `نتيجتك: ${score} من ${questions.length}`, startQuiz);
        return;
      }
      const cur = questions[idx];
      gameArea.innerHTML = `
        <div class="quiz-progress">السؤال ${idx + 1} من ${questions.length} · النقاط: ${score}</div>
        <div class="quiz-q">${escapeHTML(cur.q)}</div>
        <br>
        <div class="quiz-opts">
          ${cur.opts.map((o, i) => `<button class="quiz-opt" data-i="${i}">${escapeHTML(o.text)}</button>`).join("")}
        </div>`;
      $$(".quiz-opt", gameArea).forEach((btn) =>
        btn.addEventListener("click", () => {
          const chosen = cur.opts[+btn.dataset.i];
          $$(".quiz-opt", gameArea).forEach((b, i) => {
            b.disabled = true;
            if (cur.opts[i].correct) b.classList.add("correct");
          });
          if (chosen.correct) score++;
          else btn.classList.add("wrong");
          setTimeout(() => { idx++; showQ(); }, 900);
        })
      );
    }
    showQ();
  }

  /* --- خمّن اللاعب --- */
  function startGuess() {
    const pool = allPlayers.filter((p) => p.jersey && (p.nationalityAr || p.nationality));
    if (pool.length < 8) {
      gameIntro("🕵️ خمّن اللاعب", "تحتاج اللعبة بيانات التشكيلة — أعد تحميل الصفحة.", "حاول مجددًا", startGuess);
      return;
    }
    const rounds = shuffle(pool).slice(0, 5);
    let idx = 0, score = 0;

    function showRound() {
      if (idx >= rounds.length) {
        const emoji = score >= 5 ? "🏆" : score >= 3 ? "💚" : "😅";
        gameResult(emoji, `خمّنت ${score} من ${rounds.length}`, "هل تعرف لاعبي الملكي واحدًا واحدًا؟", startGuess);
        return;
      }
      const target = rounds[idx];
      const others = shuffle(pool.filter((p) => p !== target)).slice(0, 3);
      const opts = shuffle([target, ...others]);
      gameArea.innerHTML = `
        <div class="quiz-progress">اللاعب ${idx + 1} من ${rounds.length} · النقاط: ${score}</div>
        <div class="quiz-q">من هذا اللاعب؟</div>
        <div class="guess-hints">
          <div class="guess-hint">🎽 رقم القميص: <strong>${escapeHTML(target.jersey)}</strong></div>
          <div class="guess-hint">📍 المركز: <strong>${escapeHTML(target.roleAr || target.position)}</strong></div>
          <div class="guess-hint">🌍 الجنسية: <strong>${escapeHTML(target.nationalityAr || target.nationality)}</strong>
            ${target.flag ? `<img src="${escapeHTML(target.flag)}" alt="" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;margin-inline-start:4px">` : ""}
          </div>
          <div class="guess-hint">🎂 العمر: <strong>${escapeHTML(target.age ?? "؟")} سنة</strong></div>
        </div>
        <div class="quiz-opts">
          ${opts.map((p, i) => `<button class="quiz-opt" data-i="${i}">${escapeHTML(displayName(p))}</button>`).join("")}
        </div>`;
      $$(".quiz-opt", gameArea).forEach((btn) =>
        btn.addEventListener("click", () => {
          const chosen = opts[+btn.dataset.i];
          $$(".quiz-opt", gameArea).forEach((b, i) => {
            b.disabled = true;
            if (opts[i] === target) b.classList.add("correct");
          });
          if (chosen === target) score++;
          else btn.classList.add("wrong");
          setTimeout(() => { idx++; showRound(); }, 1000);
        })
      );
    }
    showRound();
  }

  /* --- لعبة الذاكرة --- */
  const MEMORY_LOGOS = [
    { id: "ahli", src: AHLI_LOGO },
    { id: "929", src: "https://a.espncdn.com/i/teamlogos/soccer/500/929.png" },   // الهلال
    { id: "817", src: "https://a.espncdn.com/i/teamlogos/soccer/500/817.png" },   // النصر
    { id: "2276", src: "https://a.espncdn.com/i/teamlogos/soccer/500/2276.png" }, // الاتحاد
    { id: "793", src: "https://a.espncdn.com/i/teamlogos/soccer/500/793.png" },   // الشباب
    { id: "8363", src: "https://a.espncdn.com/i/teamlogos/soccer/500/8363.png" }, // الاتفاق
    { id: "22022", src: "https://a.espncdn.com/i/teamlogos/soccer/500/22022.png" }, // القادسية
    { id: "18459", src: "https://a.espncdn.com/i/teamlogos/soccer/500/18459.png" }, // التعاون
  ];

  function startMemory() {
    const cards = shuffle(
      [...MEMORY_LOGOS, ...MEMORY_LOGOS].map((logo, i) => ({ ...logo, key: i }))
    );
    let flipped = [], moves = 0, matched = 0, lock = false;

    gameArea.innerHTML = `
      <div class="memory-grid">
        ${cards.map((c, i) => `
          <button class="mem-card" data-i="${i}" aria-label="بطاقة">
            <span class="face back">؟</span>
            <span class="face front"><img src="${c.src}" alt="" loading="lazy"></span>
          </button>`).join("")}
      </div>
      <div class="mem-stats" id="memStats">المحاولات: 0</div>`;

    $$(".mem-card", gameArea).forEach((btn) =>
      btn.addEventListener("click", () => {
        if (lock || btn.classList.contains("flipped")) return;
        btn.classList.add("flipped");
        flipped.push(btn);
        if (flipped.length < 2) return;
        lock = true;
        moves++;
        $("#memStats").textContent = `المحاولات: ${moves}`;
        const [a, b] = flipped;
        const same = cards[+a.dataset.i].id === cards[+b.dataset.i].id;
        setTimeout(() => {
          if (same) {
            a.classList.add("matched");
            b.classList.add("matched");
            matched++;
            if (matched === MEMORY_LOGOS.length) {
              setTimeout(() => gameResult("🧠", "ذاكرة أهلاوية حديدية!", `أنهيت اللعبة في ${moves} محاولة`, startMemory), 500);
            }
          } else {
            a.classList.remove("flipped");
            b.classList.remove("flipped");
          }
          flipped = [];
          lock = false;
        }, same ? 300 : 750);
      })
    );
  }

  const GAMES = {
    quiz: () => gameIntro("🧠 اختبار أهلاوي", "10 أسئلة في تاريخ الملكي ونجومه — هل أنت أهلاوي حقيقي؟", "ابدأ الاختبار", startQuiz),
    guess: () => gameIntro("🕵️ خمّن اللاعب", "نعطيك رقم القميص والمركز والجنسية والعمر.. وأنت تخمّن اللاعب من تشكيلة الفريق الحقيقية!", "ابدأ اللعب", startGuess),
    memory: () => gameIntro("🃏 لعبة الذاكرة", "طابق شعارات أندية دوري روشن في أقل عدد من المحاولات.", "ابدأ اللعب", startMemory),
  };

  $("#gamesTabs").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    $$("#gamesTabs .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    GAMES[chip.dataset.game]();
  });

  /* ================= المساعد الأهلاوي الذكي ================= */
  // مساعد ذكي يعمل محليًا في المتصفح على بيانات الموقع الحية (بلا خوادم خارجية)
  const chatState = {
    get news() { return window.__chatNews || []; },
    get matches() { return window.__chatMatches || { upcoming: [], results: [] }; },
    get standings() { return window.__chatStandings || []; },
  };

  const chatFab = $("#chatFab");
  const chatPanel = $("#chatPanel");
  const chatBody = $("#chatBody");
  const chatForm = $("#chatForm");
  const chatInput = $("#chatInput");
  const chatSuggest = $("#chatSuggest");

  const SUGGESTIONS = ["متى المباراة القادمة؟", "كم نقطة الأهلي؟", "معلومات عن توني", "توقع لي مباراة", "آخر الأخبار", "بطولات النادي"];

  function chatMsg(html, who = "bot") {
    const div = document.createElement("div");
    div.className = `chat-msg ${who}`;
    div.innerHTML = html;
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
    return div;
  }

  function renderSuggestions() {
    chatSuggest.innerHTML = SUGGESTIONS.map((s) => `<button type="button">${s}</button>`).join("");
    $$("button", chatSuggest).forEach((b) =>
      b.addEventListener("click", () => {
        chatInput.value = b.textContent;
        chatForm.requestSubmit();
      })
    );
  }

  function normalize(s) {
    return s
      .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .replace(/[ًٌٍَُِّْ]/g, "").replace(/[؟?!.,،]/g, " ")
      .toLowerCase();
  }

  function has(text, ...words) {
    return words.some((w) => text.includes(normalize(w)));
  }

  function findPlayer(text) {
    let best = null, bestLen = 0;
    for (const p of allPlayers) {
      const names = [p.ar, p.name].filter(Boolean);
      for (const n of names) {
        for (const part of normalize(n).split(" ")) {
          if (part.length >= 3 && text.includes(part) && part.length > bestLen) {
            best = p;
            bestLen = part.length;
          }
        }
      }
    }
    return best;
  }

  function playerAnswer(p) {
    const stats = p.stats
      ? Object.entries(p.stats).map(([k, v]) => `${k}: ${v}`).join(" · ")
      : "";
    return `${p.photo ? `<img src="${escapeHTML(p.photo)}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;float:inline-start;margin-inline-end:8px" onerror="this.remove()">` : ""}
      <strong>${escapeHTML(displayName(p))}</strong> 🎽 رقم ${escapeHTML(p.jersey || "؟")}<br>
      ${escapeHTML(p.roleAr || "")} · ${escapeHTML(p.nationalityAr || "")}${p.age ? ` · ${p.age} سنة` : ""}${p.rating ? ` · ⭐ ${p.rating}` : ""}
      ${stats ? `<br><small>${escapeHTML(stats)}</small>` : ""}
      ${p.bio ? `<br><small>${escapeHTML(p.bio)}</small>` : ""}`;
  }

  function ahliRow() {
    const idx = chatState.standings.findIndex((e) => e.team === "Al Ahli");
    return idx >= 0 ? { ...chatState.standings[idx], pos: idx + 1 } : null;
  }

  function predictAnswer() {
    const next = chatState.matches.upcoming.find((m) => m.date && new Date(m.date) > new Date());
    const form = chatState.matches.results.slice(0, 5);
    const wins = form.filter((m) => ahliOutcome(m) === "win").length;
    if (!next) {
      return `لا توجد مباراة مجدولة حاليًا لأتوقعها 📋<br><small>لكن للعلم: الأهلي فاز في ${wins} من آخر ${form.length} مباريات، وهو بطل آسيا نسختين متتاليتين — التوقعات دائمًا خضراء 💚</small>`;
    }
    const opp = next.home.name === "Al Ahli" ? next.away : next.home;
    const oppIdx = chatState.standings.findIndex((e) => e.team === opp.name);
    const us = ahliRow();
    let confidence = 55 + wins * 6;
    if (us && oppIdx >= 0) confidence += Math.max(-15, Math.min(15, (oppIdx - us.pos + 1) * 2));
    confidence = Math.max(35, Math.min(90, confidence));
    const score = confidence >= 70 ? "2-0" : confidence >= 55 ? "2-1" : "1-1";
    return `🔮 توقعي لمباراة <strong>${escapeHTML(next.home.nameAr)} × ${escapeHTML(next.away.nameAr)}</strong>:<br>
      فوز أهلاوي بنتيجة <strong>${score}</strong> بنسبة ثقة ${confidence}%<br>
      <small>بناءً على: ${wins} انتصارات في آخر ${form.length} مباريات${us ? ` · المركز ${us.pos} برصيد ${us.points} نقطة` : ""} — والتحليل الأهم: نحن الملكي 💚</small>`;
  }

  function answer(raw) {
    const text = normalize(raw);

    if (has(text, "محرز", "كيسيه", "كيسي")) {
      const who = has(text, "محرز") ? "رياض محرز" : "فرانك كيسيه";
      return `${who} غادر النادي في صيف 2026 🥲 — محرز بفسخ عقده بالتراضي وكيسيه بنهاية عقده. شكرًا لهما على قيادة الملكي للقب الآسيوي مرتين 💚<br><small>البديل وصل: فرانشيسكو ترينكاو من سبورتينغ لشبونة!</small>`;
    }

    if (has(text, "قادم", "متي المباراه", "متى", "موعد", "جدول")) {
      const next = chatState.matches.upcoming.find((m) => m.date && new Date(m.date) > new Date());
      if (next) {
        return `المباراة القادمة: <strong>${escapeHTML(next.home.nameAr)} × ${escapeHTML(next.away.nameAr)}</strong><br>🗓️ ${formatDate(next.date)} — ${escapeHTML(next.competition)}`;
      }
      return "لا توجد مباريات مجدولة حاليًا — نحن في فترة التوقف الصيفي، وسيظهر الجدول تلقائيًا فور اعتماده 📋";
    }

    if (has(text, "نتيجه", "نتائج", "اخر مباراه", "خسر", "فاز")) {
      const last = chatState.matches.results.slice(0, 3);
      if (!last.length) return "لا توجد نتائج مسجلة بعد.";
      return "آخر النتائج:<br>" + last.map((m) => {
        const icon = { win: "✅", loss: "❌", draw: "➖" }[ahliOutcome(m)];
        return `${icon} ${escapeHTML(m.home.nameAr)} ${escapeHTML(m.home.score)} - ${escapeHTML(m.away.score)} ${escapeHTML(m.away.nameAr)}`;
      }).join("<br>");
    }

    if (has(text, "ترتيب", "نقطه", "نقاط", "مركز", "وصيف", "متصدر")) {
      const us = ahliRow();
      if (!us) return "جدول الترتيب غير متاح حاليًا.";
      const top = chatState.standings[0];
      return `الأهلي في المركز <strong>${us.pos}</strong> برصيد <strong>${escapeHTML(us.points)}</strong> نقطة (${escapeHTML(us.wins)} فوز، ${escapeHTML(us.draws)} تعادل، ${escapeHTML(us.losses)} خسارة)${top && top.team !== "Al Ahli" ? `<br><small>المتصدر: ${escapeHTML(top.teamAr)} بـ${escapeHTML(top.points)} نقطة</small>` : " — متصدرين! 🔝"}`;
    }

    if (has(text, "توقع", "تكهن", "تحليل", "من يفوز")) return predictAnswer();

    if (has(text, "خبر", "اخبار", "جديد", "صفقه", "صفقات", "انتقال")) {
      const top = chatState.news.slice(0, 3);
      if (!top.length) return "لم أجد أخبارًا الآن — جرّب قسم الأخبار بالأعلى.";
      return "آخر الأخبار:<br>" + top.map((n) => `📰 <a href="${escapeHTML(n.link)}" target="_blank" rel="noopener">${escapeHTML(n.title)}</a>`).join("<br>");
    }

    if (has(text, "مدرب", "يايسله", "جهاز فني")) {
      const c = clubData.coach || {};
      return `المدير الفني: <strong>${escapeHTML(c.name || "ماتياس يايسله")}</strong> 🇩🇪 (${escapeHTML(c.nationality || "ألمانيا")}) — قاد الملكي للقب الآسيوي نسختين متتاليتين 2025 و2026 🏆🏆`;
    }

    if (has(text, "بطوله", "بطولات", "القاب", "لقب", "توثيق", "انجاز")) {
      return `سجل الأهلي وفق لجنة توثيق البطولات 📜:<br>
        🌏 دوري أبطال آسيا للنخبة: <strong>مرتان</strong> (2025، 2026 — نسختان متتاليتان)<br>
        🏆 الدوري السعودي: <strong>9</strong> · كأس الملك: <strong>8</strong> · كأس ولي العهد: <strong>6</strong><br>
        📜 الإجمالي: <strong>53 بطولة رسمية</strong> حتى التقرير النهائي (سبتمبر 2025) + لقب آسيا 2026`;
    }

    if (has(text, "تشكيله", "كم لاعب", "لاعبين", "قائمه")) {
      const by = { GK: 0, DF: 0, MF: 0, FW: 0 };
      allPlayers.forEach((p) => { if (by[p.position] !== undefined) by[p.position]++; });
      return `قائمة الفريق الأول تضم <strong>${allPlayers.length}</strong> لاعبًا:<br>🧤 ${by.GK} حراس · 🛡️ ${by.DF} مدافعًا · ⚙️ ${by.MF} وسطًا · ⚡ ${by.FW} مهاجمًا<br><small>اسألني عن أي لاعب بالاسم!</small>`;
    }

    if (has(text, "تاسس", "تاريخ", "متي انشئ")) {
      return "تأسس النادي الأهلي عام <strong>1937</strong> في جدة، ويُلقب بالملكي والقلعة الخضراء، وشعاره الخالد: «وعبر الزمان سنمضي معًا» 💚";
    }

    if (has(text, "ملعب", "استاد", "الجوهره")) {
      return "يلعب الأهلي على ملعب <strong>الإنماء</strong> (الجوهرة المشعة) في مدينة الملك عبدالله الرياضية بجدة، بسعة تتجاوز 62 ألف متفرج 🏟️";
    }

    if (has(text, "شعار", "هويه")) {
      return "دشّن النادي شعاره وهويته الجديدة في <strong>يوليو 2025</strong> — احتفظ بالأخضر والأبيض وعبارة «وعبر الزمان سنمضي معًا» وتاريخ التأسيس 1937 ✨";
    }

    const player = findPlayer(text);
    if (player) return playerAnswer(player);

    if (has(text, "سلام", "مرحبا", "هلا", "اهلين", "صباح", "مساء")) {
      return "هلا والله بأهلاوي أصيل! 💚 اسألني عن أي شيء يخص الملكي: اللاعبين، المباريات، الترتيب، الأخبار، أو اطلب توقعًا لمباراة!";
    }

    return `لم أفهم سؤالك تمامًا 🤔 جرّب أن تسألني عن:<br>
      ⚽ لاعب بالاسم (مثل: «معلومات عن توني»)<br>
      📅 «متى المباراة القادمة؟» · 🏅 «كم نقطة الأهلي؟»<br>
      📰 «آخر الأخبار» · 🏆 «بطولات النادي» · 🔮 «توقع لي مباراة»`;
  }

  function botReply(userText) {
    const typing = chatMsg('<span class="typing">يفكر…</span>');
    setTimeout(() => {
      typing.innerHTML = answer(userText);
      chatBody.scrollTop = chatBody.scrollHeight;
    }, 450 + Math.random() * 500);
  }

  chatFab.addEventListener("click", () => {
    chatPanel.hidden = !chatPanel.hidden;
    if (!chatPanel.hidden && !chatBody.children.length) {
      chatMsg("أهلًا بك في القلعة الخضراء! 💚 أنا المساعد الأهلاوي الذكي — أجيبك من بيانات الموقع الحية عن أي شيء يخص الملكي. جرّب الأزرار بالأسفل أو اكتب سؤالك.");
      renderSuggestions();
    }
    if (!chatPanel.hidden) chatInput.focus();
  });
  $("#chatClose").addEventListener("click", () => (chatPanel.hidden = true));

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = chatInput.value.trim();
    if (!q) return;
    chatMsg(escapeHTML(q), "user");
    chatInput.value = "";
    botReply(q);
  });

  /* ================= المتجر ================= */
  function renderStore(data) {
    $("#storeGrid").innerHTML = data.products
      .map(
        (p) => `
      <div class="store-card">
        <div class="store-img">${p.emoji}</div>
        <div class="store-body">
          ${p.badge ? `<span class="badge-new">${escapeHTML(p.badge)}</span>` : ""}
          <h3>${escapeHTML(p.name)}</h3>
          <p class="desc">${escapeHTML(p.desc)}</p>
          <div class="store-foot">
            <span class="price">${p.price} <small>ر.س</small></span>
            <a class="btn btn-small" href="${escapeHTML(data.officialStoreUrl)}" target="_blank" rel="noopener">اطلبه ↗</a>
          </div>
        </div>
      </div>`
      )
      .join("");
  }

  /* ================= الإقلاع ================= */
  loadNews();
  loadPlayers().then(() => GAMES.quiz());
  loadMatches();
  loadStandings();
  loadJSON("data/store.json").then(renderStore).catch(() => {});
})();
