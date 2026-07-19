/* موقع القلعة الخضراء — النادي الأهلي السعودي */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  /* ================= التنقل ================= */
  const navToggle = $("#navToggle");
  const mainnav = $("#mainnav");
  navToggle.addEventListener("click", () => mainnav.classList.toggle("open"));

  $$("[data-nav]").forEach((link) =>
    link.addEventListener("click", () => {
      $$(".nav-link").forEach((l) => l.classList.remove("active"));
      const target = link.dataset.nav;
      const active = $(`.nav-link[data-nav="${target}"]`);
      if (active) active.classList.add("active");
      mainnav.classList.remove("open");
    })
  );

  /* ================= أدوات ================= */
  async function loadJSON(path) {
    const res = await fetch(path + "?v=" + Date.now());
    if (!res.ok) throw new Error("فشل تحميل " + path);
    return res.json();
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
    const days = Math.floor(hrs / 24);
    return `قبل ${days} يوم`;
  }

  function escapeHTML(s) {
    const div = document.createElement("div");
    div.textContent = s || "";
    return div.innerHTML;
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
      ? `⟳ الأخبار محدثة لحظيًا (آخر تحديث: الآن)`
      : `⟳ آخر تحديث تلقائي للأخبار: ${when || "قريبًا"}`;
  }

  function parseRSS(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    return [...doc.querySelectorAll("item")].map((item) => {
      let title = item.querySelector("title")?.textContent || "";
      let source = item.querySelector("source")?.textContent || "";
      // عناوين Google News تنتهي بـ " - اسم المصدر"
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

  async function fetchWithTimeout(url, ms = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await fetch(url, { signal: ctrl.signal });
    } finally {
      clearTimeout(timer);
    }
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
    // 1) عرض ملف الأخبار المحدَّث تلقائيًا عبر GitHub Actions فورًا
    try {
      const data = await loadJSON("data/news.json");
      renderNews(data.items, data.updatedAt, false);
    } catch (_) {
      /* سيُحاول الجلب اللحظي أدناه */
    }
    // 2) الترقية للجلب اللحظي من المتصفح إن توفر
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

  // تحديث تلقائي كل 10 دقائق أثناء فتح الصفحة
  setInterval(() => loadNews(), 10 * 60 * 1000);

  /* ================= الفريق الأول ================= */
  const playersGrid = $("#playersGrid");
  const modal = $("#playerModal");
  const modalCard = $("#playerModalCard");
  let allPlayers = [];

  const POS_LABEL = { GK: "حراسة", DF: "دفاع", MF: "وسط", FW: "هجوم" };

  function initials(name) {
    return name.split(" ").slice(0, 2).map((w) => w[0]).join(" ");
  }

  function renderPlayers(filter = "all") {
    const list = filter === "all" ? allPlayers : allPlayers.filter((p) => p.position === filter);
    playersGrid.innerHTML = list
      .map(
        (p, i) => `
      <div class="player-card" data-idx="${allPlayers.indexOf(p)}">
        <div class="pc-top">
          <span class="pc-num">${p.number}</span>
          <span class="pc-pos">${escapeHTML(p.role)}</span>
        </div>
        <div class="pc-avatar">${escapeHTML(initials(p.name))}</div>
        <div class="pc-name">${escapeHTML(p.name)}</div>
        <div class="pc-country">${escapeHTML(p.nationality)} · ${p.age} سنة</div>
        <div class="pc-rating">⭐ التقييم العام: ${p.rating}</div>
      </div>`
      )
      .join("");

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
    modalCard.innerHTML = `
      <button class="pm-close" data-close>✕</button>
      <div class="pm-head">
        <div class="pm-avatar">${p.number}</div>
        <div>
          <h3>${escapeHTML(p.name)}</h3>
          <p>${escapeHTML(p.role)} · ${escapeHTML(p.nationality)}</p>
        </div>
      </div>
      <div class="pm-info">
        <div><b>${p.rating}</b><span>التقييم العام</span></div>
        <div><b>${p.age}</b><span>العمر</span></div>
        <div><b>${p.height} سم</b><span>الطول</span></div>
      </div>
      <div class="pm-stats">
        ${Object.entries(p.stats)
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
      <div class="pm-bio">${escapeHTML(p.bio)}</div>
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
  function matchScoreHTML(m) {
    const cls = m.outcome === "win" ? "win" : m.outcome === "loss" ? "loss" : "draw";
    let score = `${m.homeScore} - ${m.awayScore}`;
    if (m.penalties) score += ` (${m.penalties} ركلات ترجيح)`;
    return `<span class="match-score ${cls}">${score}</span>`;
  }

  function renderMatches(data) {
    const upcoming = $("#upcomingList");
    const results = $("#resultsList");

    upcoming.innerHTML = (data.upcoming || [])
      .map(
        (m) => `
      <div class="match-card">
        <div class="match-comp">${escapeHTML(m.competition)}</div>
        <div class="match-row">
          <span class="t">${escapeHTML(m.home)}</span>
          <span class="match-score">${m.confirmed === false ? "؟" : "VS"}</span>
          <span class="t away">${escapeHTML(m.away)}</span>
        </div>
        <div class="match-date">📍 ${escapeHTML(m.stadium || "")} · ${m.date ? formatDate(m.date) : "الموعد يُعلن لاحقًا"}</div>
      </div>`
      )
      .join("") || '<div class="match-card">بانتظار صدور جدول الموسم الجديد 📋</div>';

    results.innerHTML = (data.results || [])
      .map(
        (m) => `
      <div class="match-card">
        <div class="match-comp">${escapeHTML(m.competition)}</div>
        <div class="match-row">
          <span class="t">${escapeHTML(m.home)}</span>
          ${matchScoreHTML(m)}
          <span class="t away">${escapeHTML(m.away)}</span>
        </div>
        <div class="match-date">${formatDate(m.date)}${m.note ? " · " + escapeHTML(m.note) : ""}</div>
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
          <div class="nm-team"><div class="logo">🥇</div><div class="name">سوبر 2025</div></div>
        </div>
        <div class="nm-meta">بانتظار جدول الموسم الجديد — سيظهر العد التنازلي للمباراة القادمة هنا تلقائيًا</div>`;
      return;
    }

    card.innerHTML = `
      <div class="nm-title">⏳ المباراة القادمة — ${escapeHTML(next.competition)}</div>
      <div class="nm-teams">
        <div class="nm-team"><div class="logo">🦅</div><div class="name">${escapeHTML(next.home)}</div></div>
        <span class="nm-vs">VS</span>
        <div class="nm-team"><div class="logo">⚽</div><div class="name">${escapeHTML(next.away)}</div></div>
      </div>
      <div class="nm-countdown" id="countdown"></div>
      <div class="nm-meta">📍 ${escapeHTML(next.stadium || "")} · ${formatDate(next.date)}</div>`;

    const cd = $("#countdown");
    function tick() {
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
    }
    tick();
  }

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

  loadJSON("data/players.json")
    .then((d) => {
      allPlayers = d.players;
      renderPlayers();
    })
    .catch(() => (playersGrid.innerHTML = '<div class="loader">تعذّر تحميل بيانات الفريق.</div>'));

  loadJSON("data/matches.json")
    .then(renderMatches)
    .catch(() => {});

  loadJSON("data/store.json")
    .then(renderStore)
    .catch(() => {});
})();
