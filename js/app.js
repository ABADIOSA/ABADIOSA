/* موقع القلعة الخضراء — النادي الأهلي السعودي */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const AHLI_ID = "8346";
  // الشعار الجديد (هوية 2025)
  const AHLI_LOGO = "https://upload.wikimedia.org/wikipedia/ar/thumb/3/3e/Al-Ahli_SFC_%282025%29.svg/langar-330px-Al-Ahli_SFC_%282025%29.svg.png";
  const ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer/ksa.1";
  const ESPN_STANDINGS = "https://site.api.espn.com/apis/v2/sports/soccer/ksa.1/standings";

  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem("ahli:" + key)) ?? fallback; }
      catch (_) { return fallback; }
    },
    set(key, val) {
      try { localStorage.setItem("ahli:" + key, JSON.stringify(val)); } catch (_) {}
    },
  };

  /* ================= الوضع الليلي ================= */
  const themeBtn = $("#themeBtn");
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeBtn.textContent = theme === "dark" ? "☀️" : "🌙";
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.content = theme === "dark" ? "#0d1512" : "#00331d";
  }
  applyTheme(store.get("theme", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    store.set("theme", next);
    applyTheme(next);
  });

  /* ================= التنقل والحركات ================= */
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

  // شريط تقدم القراءة
  const progressBar = $("#progressBar");
  addEventListener("scroll", () => {
    const max = document.body.scrollHeight - innerHeight;
    progressBar.style.width = max > 0 ? `${(scrollY / max) * 100}%` : "0";
  }, { passive: true });

  // إبراز القسم الحالي + حركات الظهور
  const revealObserver = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("shown")),
    { threshold: 0.08 }
  );
  $$(".reveal").forEach((el) => revealObserver.observe(el));

  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const link = $(`.nav-link[data-nav="${e.target.id}"]`);
        if (link) {
          $$(".nav-link").forEach((l) => l.classList.remove("active"));
          link.classList.add("active");
        }
      });
    },
    { rootMargin: "-40% 0px -55% 0px" }
  );
  $$("main section[id]").forEach((s) => sectionObserver.observe(s));

  /* ================= أدوات ================= */
  async function loadJSON(path) {
    const res = await fetch(path + (path.includes("?") ? "&" : "?") + "v=" + Date.now());
    if (!res.ok) throw new Error("فشل تحميل " + path);
    return res.json();
  }

  async function fetchWithTimeout(url, ms = 8000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try { return await fetch(url, { signal: ctrl.signal }); }
    finally { clearTimeout(timer); }
  }

  // كل المواعيد بتوقيت السعودية وبالتقويم الميلادي مهما كان جهاز الزائر
  const KSA = { timeZone: "Asia/Riyadh" };
  const AR_CAL = "ar-SA-u-ca-gregory-nu-latn";

  function formatDate(d) {
    if (!d) return "";
    const date = new Date(d);
    if (isNaN(date)) return d;
    return date.toLocaleDateString(AR_CAL, {
      ...KSA, weekday: "long", year: "numeric", month: "long", day: "numeric",
    });
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

  function countUp(el, target, suffix = "") {
    const dur = 900, start = performance.now();
    (function step(now) {
      const p = Math.min(1, (now - start) / dur);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
      if (p < 1) requestAnimationFrame(step);
    })(start);
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
  let newsItems = [];

  function renderNews(items, updatedAt, live) {
    if (items && items.length) newsItems = items;
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
        title, source,
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
      } catch (_) { /* التالي */ }
    }
    return null;
  }

  async function loadNews() {
    try {
      const data = await loadJSON("data/news.json");
      renderNews(data.items, data.updatedAt, false);
    } catch (_) { /* تحت */ }
    const live = await fetchLiveNews();
    if (live) renderNews(live, new Date().toISOString(), true);
    else if (!newsGrid.querySelector(".news-card")) {
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
  let seasonStats = null;
  const clubData = { coach: null, staff: [], departed: [] };

  const STAT_KEYS_OUT = ["السرعة", "التسديد", "التمرير", "المراوغة", "الدفاع", "القوة البدنية"];
  const STAT_KEYS_GK = ["الانعكاسات", "التمركز", "الشجاعة", "اللعب بالقدم", "الكرات العالية", "ركلات الجزاء"];

  function pseudoStats(p) {
    const seed = parseInt(p.id, 10) || (p.name || "").length * 7;
    const rand = (n) => 58 + ((seed * 37 + n * 101) % 20);
    const keys = p.position === "GK" ? STAT_KEYS_GK : STAT_KEYS_OUT;
    const stats = {};
    keys.forEach((k, i) => (stats[k] = rand(i)));
    return stats;
  }

  const displayName = (p) => p.ar || p.name;
  const initials = (p) => displayName(p).split(" ").slice(0, 2).map((w) => w[0]).join(" ");
  const playerGoals = (p) =>
    (seasonStats?.scorers || []).find((s) => s.name === p.name)?.value || 0;

  function renderStaff(staff, note) {
    if (!staff || !staff.length) return;
    $("#staffCards").innerHTML =
      staff
        .map(
          (s) => `
      <div class="coach-card">
        ${s.photo ? `<img class="coach-photo" src="${escapeHTML(s.photo)}" alt="${escapeHTML(s.name)}" onerror="this.remove()">` : ""}
        <div class="coach-info">
          <div class="label">${escapeHTML(s.role || "الجهاز الفني")}${s.since ? ` · منذ ${escapeHTML(s.since)}` : ""}</div>
          <div class="name">${escapeHTML(s.name)}</div>
          <div class="nat">${s.flag ? `<img src="${escapeHTML(s.flag)}" alt="" style="width:18px;height:18px;border-radius:50%;vertical-align:middle;margin-inline-end:4px" onerror="this.remove()">` : ""}${escapeHTML(s.nationality || "")}${s.contract ? ` · عقد ${escapeHTML(s.contract)}` : ""}</div>
          ${s.note ? `<div class="coach-note">${escapeHTML(s.note)}</div>` : ""}
        </div>
      </div>`
        )
        .join("") + (note ? `<p class="section-sub" style="margin-top:10px">ℹ️ ${escapeHTML(note)}</p>` : "");
  }

  async function loadPlayers() {
    try {
      const [squad, meta, team, stats] = await Promise.all([
        loadJSON("data/squad.json"),
        loadJSON("data/players.json"),
        loadJSON("data/team.json").catch(() => ({})),
        loadJSON("data/stats.json").catch(() => null),
      ]);
      seasonStats = stats;
      const overlay = meta.overlay || {};
      clubData.departed = meta.departed || [];
      clubData.staff = team.staff && team.staff.length ? team.staff : meta.staff || [];
      clubData.coach = clubData.staff[0] || null;
      renderStaff(clubData.staff, meta.staffNote);
      const departedSet = new Set(clubData.departed);
      allPlayers = (squad.players || [])
        .filter((p) => !departedSet.has(p.name))
        .map((p) => {
          const extra = overlay[p.name] || {};
          return { ...p, ar: extra.ar, rating: extra.rating || null, stats: extra.stats || null, bio: extra.bio || null };
        });
      const order = { GK: 0, DF: 1, MF: 2, FW: 3 };
      allPlayers.sort(
        (a, b) => (order[a.position] ?? 9) - (order[b.position] ?? 9) || (b.rating || 0) - (a.rating || 0)
      );
      renderPlayers();
      renderStats();
      renderPitch();
      setupCompare();
      buildSearchIndex();
    } catch (_) {
      playersGrid.innerHTML = '<div class="loader">تعذّر تحميل بيانات الفريق.</div>';
    }
  }

  function renderPlayers(filter = "all") {
    const list = filter === "all" ? allPlayers : allPlayers.filter((p) => p.position === filter);
    playersGrid.innerHTML =
      list
        .map((p) => {
          const goals = playerGoals(p);
          return `
      <div class="player-card" data-idx="${allPlayers.indexOf(p)}">
        ${goals ? `<span class="pc-goals">⚽ ${goals}</span>` : ""}
        <div class="pc-top">
          <span class="pc-num">${escapeHTML(p.jersey || "-")}</span>
          <span class="pc-pos">${escapeHTML(p.roleAr || p.position)}</span>
        </div>
        <div class="pc-avatar">${escapeHTML(initials(p))}
          ${p.photo ? `<img class="pc-photo" src="${escapeHTML(p.photo)}" alt="${escapeHTML(displayName(p))}" loading="lazy" onerror="this.remove()">` : ""}
          ${p.flag ? `<img class="pc-flag" src="${escapeHTML(p.flag)}" alt="" loading="lazy" onerror="this.remove()">` : ""}
        </div>
        <div class="pc-name">${escapeHTML(displayName(p))}</div>
        <div class="pc-country">${escapeHTML(p.nationalityAr || p.nationality || "")}${p.age ? ` · ${p.age} سنة` : ""}</div>
        <div class="pc-rating">${p.rating ? `⭐ التقييم العام: ${p.rating}` : "🌱 لاعب صاعد"}</div>
      </div>`;
        })
        .join("") || '<div class="loader">لا يوجد لاعبون في هذا المركز.</div>';

    $$(".player-card", playersGrid).forEach((card) =>
      card.addEventListener("click", () => openPlayer(allPlayers[+card.dataset.idx]))
    );
  }

  const statClass = (v) => (v >= 85 ? "top" : v >= 75 ? "high" : "");

  function openPlayer(p) {
    const stats = p.stats || pseudoStats(p);
    const estimated = !p.stats;
    const goals = playerGoals(p);
    const assists = (seasonStats?.assists || []).find((s) => s.name === p.name)?.value || 0;
    modalCard.innerHTML = `
      <button class="pm-close" data-close>✕</button>
      <div class="pm-head">
        <div class="pm-avatar">${escapeHTML(p.jersey || "-")}${p.photo ? `<img src="${escapeHTML(p.photo)}" alt="" onerror="this.remove()">` : ""}</div>
        <div>
          <h3>${escapeHTML(displayName(p))}</h3>
          <p>${escapeHTML(p.roleAr || "")} · ${escapeHTML(p.nationalityAr || p.nationality || "")}
            ${p.flag ? `<img src="${escapeHTML(p.flag)}" alt="" style="width:18px;height:18px;border-radius:50%;vertical-align:middle;margin-inline-start:4px" onerror="this.remove()">` : ""}
          </p>
        </div>
      </div>
      <div class="pm-info">
        <div><b>${p.rating || "—"}</b><span>التقييم</span></div>
        <div><b>${p.age ?? "—"}</b><span>العمر</span></div>
        <div><b>${goals}</b><span>أهداف</span></div>
        <div><b>${assists}</b><span>صناعة</span></div>
      </div>
      <div class="pm-stats">
        ${Object.entries(stats)
          .map(
            ([k, v]) => `
          <div class="stat-row">
            <span>${escapeHTML(k)}</span>
            <div class="stat-bar"><div class="stat-fill ${statClass(v)}" style="width:0"></div></div>
            <span class="stat-val">${v}</span>
          </div>`
          )
          .join("")}
      </div>
      ${estimated ? '<div class="pm-bio">📊 تقييمات تقديرية أولية — الأهداف والصناعة أرقام حقيقية من المباريات.</div>' : ""}
      ${p.bio ? `<div class="pm-bio">${escapeHTML(p.bio)}</div>` : ""}
      <div class="pm-actions"><button class="btn btn-small" id="pmCompare">قارنه بلاعب آخر ⚖️</button></div>
    `;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    // تحريك الأشرطة
    requestAnimationFrame(() => {
      $$(".stat-fill", modalCard).forEach((bar, i) => {
        bar.style.width = Object.values(stats)[i] + "%";
      });
    });
    $("#pmCompare").addEventListener("click", () => {
      closeModal();
      $("#cmpA").value = String(allPlayers.indexOf(p));
      renderCompare();
      $("#lineup").scrollIntoView({ behavior: "smooth" });
    });
  }

  function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  modal.addEventListener("click", (e) => e.target.matches("[data-close]") && closeModal());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (!modal.hidden) closeModal();
      if (!$("#searchPanel").hidden) $("#searchPanel").hidden = true;
    }
  });

  $("#posFilters").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    $$("#posFilters .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    renderPlayers(chip.dataset.pos);
  });

  /* ================= الإحصائيات والهدافون ================= */
  function renderStats() {
    if (!seasonStats) return;
    const t = seasonStats.team || {};
    const tiles = [
      { v: t.goalsFor, label: "أهداف مسجلة ⚽" },
      { v: t.goalsAgainst, label: "أهداف مستقبلة 🥅" },
      { v: t.avgShots, label: "متوسط التسديدات 🎯" },
      { v: t.avgPossession, label: "متوسط الاستحواذ %", suffix: "%" },
      { v: t.avgCorners, label: "متوسط الركنيات 🚩" },
    ];
    $("#statsGrid").innerHTML = tiles
      .map((x) => `<div class="stat-tile"><b data-count="${x.v || 0}">0</b><span>${x.label}</span></div>`)
      .join("");
    $("#statsSub").textContent = `محسوبة تلقائيًا من ${seasonStats.matchesAnalyzed} مباراة رسمية.`;

    // عدّاد متحرك عند الظهور
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        countUp(e.target, parseFloat(e.target.dataset.count));
        obs.unobserve(e.target);
      });
    });
    $$("#statsGrid b").forEach((b) => io.observe(b));

    const photoOf = (name) => allPlayers.find((p) => p.name === name)?.photo || "";
    const arOf = (name) => allPlayers.find((p) => p.name === name)?.ar || name;

    const listHTML = (arr, icon) => {
      if (!arr || !arr.length) return '<div class="loader">لا توجد بيانات.</div>';
      const max = arr[0].value || 1;
      return arr
        .map((s, i) => `
        <div class="scorer-row ${i === 0 ? "first" : ""}">
          <span class="scorer-rank">${i + 1}</span>
          ${photoOf(s.name)
            ? `<img class="scorer-photo" src="${escapeHTML(photoOf(s.name))}" alt="" loading="lazy" onerror="this.remove()">`
            : ""}
          <div class="scorer-name">${escapeHTML(arOf(s.name))}
            <div class="scorer-bar"><i style="width:${(s.value / max) * 100}%"></i></div>
          </div>
          <span class="scorer-val">${s.value}${icon}</span>
        </div>`)
        .join("");
    };
    $("#scorersList").innerHTML = listHTML(seasonStats.scorers, "");
    // ESPN لا يوفّر صناع الأهداف لهذا الدوري — نعرض الإنذارات (بيانات حقيقية) بدلها
    const second = (seasonStats.assists || []).length ? seasonStats.assists : seasonStats.cards || [];
    $("#secondListTitle").textContent = (seasonStats.assists || []).length ? "🅰️ صناع الأهداف" : "🟨 الإنذارات";
    $("#secondList").innerHTML = listHTML(second, "");

    // أرقام سريعة في الواجهة
    $("#heroQuick").innerHTML = `
      <div><b>2</b><span>ألقاب آسيا</span></div>
      <div><b>53</b><span>بطولة موثقة</span></div>
      <div><b>${t.goalsFor || 0}</b><span>أهداف الموسم</span></div>
      <div><b>1937</b><span>سنة التأسيس</span></div>`;
  }

  /* ================= التشكيلة على الملعب ================= */
  const FORMATIONS = {
    "4-3-3": [1, 4, 3, 3],
    "4-2-3-1": [1, 4, 2, 4],
    "3-5-2": [1, 3, 5, 2],
  };

  function bestBy(position, count, used) {
    return allPlayers
      .filter((p) => p.position === position && !used.has(p.name))
      .sort((a, b) => (b.rating || 60) - (a.rating || 60) || playerGoals(b) - playerGoals(a))
      .slice(0, count);
  }

  function renderPitch(formation = "4-3-3") {
    if (!allPlayers.length) return;
    const [gk, df, mf, fw] = FORMATIONS[formation];
    const used = new Set();
    const pick = (pos, n) => {
      const sel = bestBy(pos, n, used);
      sel.forEach((p) => used.add(p.name));
      return sel;
    };
    const rows = [pick("FW", fw), pick("MF", mf), pick("DF", df), pick("GK", gk)];

    $("#pitch").innerHTML = rows
      .map(
        (row) => `<div class="pitch-row">${row
          .map(
            (p) => `
        <div class="pitch-player" data-idx="${allPlayers.indexOf(p)}">
          <div class="pp-shirt">${escapeHTML(p.jersey || "-")}
            ${p.photo ? `<img src="${escapeHTML(p.photo)}" alt="" loading="lazy" onerror="this.remove()">` : ""}
          </div>
          <div class="pp-name">${escapeHTML(displayName(p).split(" ").slice(-1)[0])}</div>
        </div>`
          )
          .join("")}</div>`
      )
      .join("");

    $$(".pitch-player").forEach((el) =>
      el.addEventListener("click", () => openPlayer(allPlayers[+el.dataset.idx]))
    );
  }

  $("#formationPick").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    $$("#formationPick .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    renderPitch(chip.dataset.formation);
  });

  /* ================= مقارنة اللاعبين ================= */
  function setupCompare() {
    const opts = allPlayers
      .map((p, i) => `<option value="${i}">${escapeHTML(displayName(p))} (${escapeHTML(p.roleAr || "")})</option>`)
      .join("");
    const a = $("#cmpA"), b = $("#cmpB");
    a.innerHTML = opts;
    b.innerHTML = opts;
    // الافتراضي: نجمان من خارج حراسة المرمى ليتقابلا على نفس الخصائص
    const rated = allPlayers.filter((p) => p.rating && p.position !== "GK");
    a.value = String(allPlayers.indexOf(rated[0] || allPlayers[0]));
    b.value = String(allPlayers.indexOf(rated[1] || allPlayers[1] || allPlayers[0]));
    a.addEventListener("change", renderCompare);
    b.addEventListener("change", renderCompare);
    renderCompare();
  }

  function headHTML(p) {
    return `
      <div class="compare-head">
        ${p.photo
          ? `<img src="${escapeHTML(p.photo)}" alt="" onerror="this.outerHTML='<div class=\\'ph\\'>${escapeHTML(p.jersey || "?")}</div>'">`
          : `<div class="ph">${escapeHTML(p.jersey || "?")}</div>`}
        <div class="nm">${escapeHTML(displayName(p))}</div>
        <div class="meta">${escapeHTML(p.roleAr || "")} · ${escapeHTML(p.nationalityAr || "")}</div>
      </div>`;
  }

  function renderCompare() {
    const a = allPlayers[+$("#cmpA").value];
    const b = allPlayers[+$("#cmpB").value];
    if (!a || !b) return;
    const sa = a.stats || pseudoStats(a);
    const sb = b.stats || pseudoStats(b);
    const keys = Object.keys(sa).filter((k) => k in sb);
    const mixed = keys.length === 0; // حارس مقابل لاعب ميدان: الخصائص مختلفة تمامًا

    const extra = [
      ["التقييم العام", a.rating || 0, b.rating || 0],
      ["أهداف الموسم", playerGoals(a), playerGoals(b)],
      ["العمر", a.age || 0, b.age || 0],
    ];
    const rows = [...extra, ...keys.map((k) => [k, sa[k], sb[k]])];
    let winsA = 0, winsB = 0;

    const rowsHTML = rows
      .map(([label, va, vb]) => {
        if (va > vb) winsA++;
        else if (vb > va) winsB++;
        const max = Math.max(va, vb, 1);
        return `
        <div class="cmp-row">
          <div class="cmp-side left ${va >= vb ? "winner" : ""}">
            <b>${va}</b><div class="bar"><i style="width:${(va / max) * 100}%"></i></div>
          </div>
          <div class="cmp-label">${escapeHTML(label)}</div>
          <div class="cmp-side right ${vb >= va ? "winner" : ""}">
            <b>${vb}</b><div class="bar"><i style="width:${(vb / max) * 100}%"></i></div>
          </div>
        </div>`;
      })
      .join("");

    const verdict =
      winsA === winsB
        ? `⚖️ تعادل تام بين ${displayName(a)} و${displayName(b)} — كلاهما ركيزة في الملكي!`
        : winsA > winsB
        ? `🏆 <strong>${escapeHTML(displayName(a))}</strong> يتفوق بـ${winsA} مقابل ${winsB}`
        : `🏆 <strong>${escapeHTML(displayName(b))}</strong> يتفوق بـ${winsB} مقابل ${winsA}`;

    $("#cmpOut").innerHTML = `
      <div class="compare-heads">${headHTML(a)}<span class="compare-vs">VS</span>${headHTML(b)}</div>
      <div class="compare-rows">${rowsHTML}</div>
      ${mixed ? '<div class="cmp-verdict">🧤 مقارنة حارس بلاعب ميدان — خصائصهما مختلفة الطبيعة، لذا نقارن المشترك فقط.</div>' : ""}
      <div class="cmp-verdict">${verdict}</div>`;
  }

  /* ================= المباريات ================= */
  function teamHTML(side, away) {
    return `<span class="t ${away ? "away" : ""}">
      ${side.logo ? `<img src="${escapeHTML(side.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ""}
      <span>${escapeHTML(side.nameAr || side.name)}</span>
    </span>`;
  }

  function ahliOutcome(m) {
    const ahliHome = m.home.name === "Al Ahli" || m.home.nameAr === "الأهلي";
    const us = ahliHome ? m.home : m.away;
    const them = ahliHome ? m.away : m.home;
    const a = parseInt(us.score, 10), b = parseInt(them.score, 10);
    if (isNaN(a) || isNaN(b)) return "draw";
    return a > b ? "win" : a < b ? "loss" : "draw";
  }

  let matchesData = { live: [], upcoming: [], results: [], archive: [] };
  let storeData = { products: [] };

  function timeHM(d) {
    const date = new Date(d);
    if (isNaN(date)) return "";
    return date.toLocaleTimeString(AR_CAL, { ...KSA, hour: "2-digit", minute: "2-digit" }) + " (بتوقيت السعودية)";
  }

  const AR_VENUES = {
    "Al-Awwal Park": "ملعب الأول بارك — الرياض",
    "King Abdullah Sports City": "ملعب الإنماء (الجوهرة المشعة) — جدة",
    "King Abdullah Sports City Stadium": "ملعب الإنماء (الجوهرة المشعة) — جدة",
    "Prince Faisal bin Fahd Stadium": "ملعب الأمير فيصل بن فهد — الرياض",
    "Al-Hazm Club Stadium": "ملعب نادي الحزم — الرس",
    "Al-Shabab Club Stadium": "ملعب نادي الشباب — الرياض",
    "Prince Sultan bin Abdulaziz Sports City Stadium": "ملعب الأمير سلطان بن عبدالعزيز — أبها",
    "King Fahd Sports City": "ملعب الملك فهد — الرياض",
    "Prince Mohamed bin Fahd Stadium": "ملعب الأمير محمد بن فهد — الدمام",
    "Prince Abdullah al-Faisal Stadium": "ملعب الأمير عبدالله الفيصل — جدة",
    "King Saud University Stadium": "ملعب جامعة الملك سعود — الرياض",
  };
  const arVenue = (v) => (v ? AR_VENUES[v] || v : "");

  function renderMatches(data) {
    matchesData = data;
    const upcoming = $("#upcomingList"), results = $("#resultsList");

    // شريط المباراة المباشرة
    const liveList = data.live || [];
    $("#liveBanner").innerHTML = liveList.length
      ? liveList
          .map(
            (m) => `
      <div class="live-banner">
        <span class="live-dot">● مباشر ${escapeHTML(m.clock || m.statusText || "")}</span>
        <div class="match-row">${teamHTML(m.home, false)}
          <span class="match-score live">${escapeHTML(m.home.score)} - ${escapeHTML(m.away.score)}</span>
          ${teamHTML(m.away, true)}</div>
        <div class="match-date">${escapeHTML(m.competition)}${m.venue ? " · 📍 " + escapeHTML(arVenue(m.venue)) : ""}</div>
      </div>`
          )
          .join("")
      : "";

    upcoming.innerHTML =
      (data.upcoming || [])
        .slice(0, 6)
        .map((m, i) => {
          const today = new Date(m.date).toDateString() === new Date().toDateString();
          return `
      <div class="match-card ${today ? "today" : ""}">
        <div class="match-comp">${escapeHTML(m.competition)}${today ? ' <span class="today-tag">اليوم 🔥</span>' : ""}</div>
        <div class="match-row">${teamHTML(m.home, false)}<span class="match-score">VS</span>${teamHTML(m.away, true)}</div>
        <div class="match-date">🗓️ ${formatDate(m.date)} · ⏰ ${timeHM(m.date)}${m.venue ? " · 📍 " + escapeHTML(arVenue(m.venue)) : ""}</div>
      </div>`;
        })
        .join("") ||
      '<div class="match-card">لا توجد مباريات مجدولة حاليًا — تُضاف تلقائيًا فور اعتماد الجدول 📋</div>';

    // نتائج الموسم الحالي، وإلا أرشيف الموسم الماضي بوسم واضح
    const shown = (data.results || []).length ? data.results : data.archive || [];
    const isArchive = !(data.results || []).length && (data.archive || []).length;
    $("#resultsTitle").textContent = isArchive ? "نتائج الموسم الماضي" : "آخر النتائج";

    results.innerHTML =
      shown
        .slice(0, 6)
        .map(
          (m) => `
      <div class="match-card">
        <div class="match-comp">${escapeHTML(m.competition)}</div>
        <div class="match-row">${teamHTML(m.home, false)}
          <span class="match-score ${ahliOutcome(m)}">${escapeHTML(m.home.score)} - ${escapeHTML(m.away.score)}</span>
          ${teamHTML(m.away, true)}</div>
        <div class="match-date">${formatDate(m.date)}</div>
      </div>`
        )
        .join("") || '<div class="match-card">لا توجد نتائج مسجلة.</div>';

    // شريط الفورم (آخر 5)
    const form = shown.slice(0, 5).reverse();
    $("#formStrip").innerHTML = form.length
      ? `<span style="font-size:12px;color:var(--muted);font-weight:700">آخر 5:</span>` +
        form
          .map((m) => {
            const o = ahliOutcome(m);
            return `<span class="form-dot ${o}" title="${escapeHTML(m.home.nameAr)} ${escapeHTML(m.home.score)}-${escapeHTML(m.away.score)} ${escapeHTML(m.away.nameAr)}">${o === "win" ? "ف" : o === "loss" ? "خ" : "ت"}</span>`;
          })
          .join("")
      : "";

    renderNextMatchCard(data);
  }

  function renderNextMatchCard(data) {
    const card = $("#nextMatchCard");

    // مباراة جارية الآن تتصدر البطاقة
    const now = (data.live || [])[0];
    if (now) {
      card.innerHTML = `
        <div class="nm-title">🔴 مباشر الآن — ${escapeHTML(now.competition)}</div>
        <div class="nm-teams">
          <div class="nm-team">${now.home.logo ? `<img class="logo" src="${escapeHTML(now.home.logo)}" alt="" onerror="this.remove()">` : '<div class="logo">⚽</div>'}<div class="name">${escapeHTML(now.home.nameAr)}</div></div>
          <span class="nm-vs">${escapeHTML(now.home.score)} - ${escapeHTML(now.away.score)}</span>
          <div class="nm-team">${now.away.logo ? `<img class="logo" src="${escapeHTML(now.away.logo)}" alt="" onerror="this.remove()">` : '<div class="logo">⚽</div>'}<div class="name">${escapeHTML(now.away.nameAr)}</div></div>
        </div>
        <div class="nm-meta">⏱️ ${escapeHTML(now.clock || now.statusText || "جارية")}${now.venue ? " · 📍 " + escapeHTML(arVenue(now.venue)) : ""}</div>`;
      return;
    }

    const next = (data.upcoming || []).find((m) => m.date && new Date(m.date) > new Date());

    if (!next) {
      card.innerHTML = `
        <div class="nm-title">🏆 آخر إنجازات الملكي</div>
        <div class="nm-teams">
          <div class="nm-team"><div class="logo">🌏</div><div class="name">بطل آسيا 2025</div></div>
          <span class="nm-vs">+</span>
          <div class="nm-team"><div class="logo">🌏</div><div class="name">بطل آسيا 2026</div></div>
        </div>
        <div class="nm-meta">نسختان متتاليتان — سيظهر العد التنازلي للمباراة القادمة هنا تلقائيًا</div>`;
      return;
    }

    const logoOr = (side) =>
      side.logo ? `<img class="logo" src="${escapeHTML(side.logo)}" alt="" onerror="this.remove()">` : '<div class="logo">⚽</div>';

    card.innerHTML = `
      <div class="nm-title">⏳ المباراة القادمة — ${escapeHTML(next.competition)}</div>
      <div class="nm-teams">
        <div class="nm-team">${logoOr(next.home)}<div class="name">${escapeHTML(next.home.nameAr || next.home.name)}</div></div>
        <span class="nm-vs">VS</span>
        <div class="nm-team">${logoOr(next.away)}<div class="name">${escapeHTML(next.away.nameAr || next.away.name)}</div></div>
      </div>
      <div class="nm-countdown" id="countdown"></div>
      <div class="nm-meta">🗓️ ${formatDate(next.date)} · ⏰ ${timeHM(next.date)}${next.venue ? "<br>📍 " + escapeHTML(arVenue(next.venue)) : ""}</div>`;

    const cd = $("#countdown");
    (function tick() {
      const diff = new Date(next.date) - new Date();
      if (diff <= 0) { cd.innerHTML = "<b>انطلقت المباراة! 🔥</b>"; return; }
      const d = Math.floor(diff / 86400000), h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000), s = Math.floor((diff % 60000) / 1000);
      cd.innerHTML = `
        <div class="cd"><b>${d}</b><span>يوم</span></div>
        <div class="cd"><b>${h}</b><span>ساعة</span></div>
        <div class="cd"><b>${m}</b><span>دقيقة</span></div>
        <div class="cd"><b>${s}</b><span>ثانية</span></div>`;
      setTimeout(tick, 1000);
    })();
  }

  const AR_TEAMS = {
    "Al Ahli": "الأهلي", "Abha": "أبها", "Al Diriyah": "الدرعية",
    "Al-Faisaly": "الفيصلي", "Al Faisaly": "الفيصلي",
    "Al Ettifaq": "الاتفاق", "Al Fateh": "الفتح", "Al Fayha": "الفيحاء",
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
      name, nameAr: arTeam(name),
      logo: teamLogo(name, (team.logos && team.logos[0] && team.logos[0].href) || team.logo || ""),
      score: typeof score === "object" && score !== null ? score.displayValue || "" : String(score ?? ""),
    };
  }

  function ymd(d) {
    return d.toISOString().slice(0, 10).replace(/-/g, "");
  }

  // نقطة scoreboard تعمل حتى قبل انطلاق الموسم، وتعطي النتيجة أثناء المباراة
  async function fetchLiveMatches() {
    const now = new Date();
    const from = new Date(now.getTime() - 60 * 86400000);
    const to = new Date(now.getTime() + 150 * 86400000);
    const res = await fetchWithTimeout(`${ESPN}/scoreboard?dates=${ymd(from)}-${ymd(to)}&limit=500`, 12000);
    if (!res.ok) throw new Error("espn scoreboard");
    const d = await res.json();
    const live = [], upcoming = [], results = [];

    for (const e of d.events || []) {
      const comp = e.competitions?.[0];
      if (!comp) continue;
      const sides = (comp.competitors || []).map((c) => c.team?.displayName);
      if (!sides.includes("Al Ahli")) continue;

      const status = comp.status || {};
      const state = status.type?.state || "";
      let compName = (e.league?.name || comp.league?.name || "");
      if (!compName || compName.includes("Saudi Pro League")) compName = "دوري روشن السعودي";
      else if (compName.includes("King") && compName.includes("Cup")) compName = "كأس خادم الحرمين الشريفين";
      else if (compName.includes("Champions") && compName.includes("Elite")) compName = "دوري أبطال آسيا للنخبة";

      const match = {
        date: e.date,
        competition: compName,
        state,
        statusText: status.type?.shortDetail || "",
        clock: status.displayClock || "",
        venue: comp.venue?.fullName || "",
      };
      for (const c of comp.competitors || []) match[c.homeAway === "home" ? "home" : "away"] = espnSide(c);
      if (!match.home || !match.away) continue;
      (state === "post" ? results : state === "in" ? live : upcoming).push(match);
    }
    upcoming.sort((a, b) => new Date(a.date) - new Date(b.date));
    results.sort((a, b) => new Date(b.date) - new Date(a.date));
    return { live, upcoming, results };
  }

  async function loadMatches() {
    let stored = { live: [], upcoming: [], results: [], archive: [] };
    try {
      stored = await loadJSON("data/matches_auto.json");
      renderMatches(stored);
    } catch (_) { renderMatches(stored); }

    try {
      const live = await fetchLiveMatches();
      if (live.upcoming.length || live.results.length || live.live.length) {
        // نحتفظ بأرشيف الموسم الماضي المخزَّن حين لا توجد نتائج بعد
        renderMatches({ ...live, archive: stored.archive || [] });
      }
    } catch (_) { /* نكتفي بالمخزن */ }
  }

  // أثناء المباراة: تحديث النتيجة كل دقيقة
  setInterval(() => {
    const soon = (matchesData.upcoming || []).some(
      (m) => Math.abs(new Date(m.date) - new Date()) < 3 * 3600000
    );
    if ((matchesData.live || []).length || soon) loadMatches();
  }, 60 * 1000);

  /* ================= الترتيب ================= */
  let standingsData = [];

  function renderStandings(data) {
    if (data.entries && data.entries.length) standingsData = data.entries;
    const tbody = $("#standingsTable tbody");
    if (!data.entries || !data.entries.length) {
      tbody.innerHTML = '<tr><td colspan="8">جدول الترتيب غير متاح حاليًا — يظهر تلقائيًا مع انطلاق الموسم.</td></tr>';
      return;
    }
    $("#standingsSeason").textContent = data.isFinal
      ? `📌 الترتيب النهائي لموسم ${escapeHTML(String(data.seasonName).replace("Saudi Pro League","دوري روشن"))} — يتبدّل لجدول الموسم الجديد فور انطلاقه`
      : data.seasonName
      ? `موسم ${escapeHTML(String(data.seasonName).replace("Saudi Pro League","دوري روشن"))} — يتحدث تلقائيًا`
      : "يتحدث تلقائيًا";
    tbody.innerHTML = data.entries
      .map(
        (e, i) => `
      <tr class="${e.team === "Al Ahli" ? "ahli" : ""}">
        <td>${i + 1}</td>
        <td class="team-col"><span class="team-cell">
          ${e.logo ? `<img src="${escapeHTML(e.logo)}" alt="" loading="lazy" onerror="this.remove()">` : ""}${escapeHTML(e.teamAr || e.team)}
        </span></td>
        <td>${escapeHTML(e.played)}</td><td>${escapeHTML(e.wins)}</td><td>${escapeHTML(e.draws)}</td>
        <td>${escapeHTML(e.losses)}</td><td>${escapeHTML(e.goalDiff)}</td><td class="pts">${escapeHTML(e.points)}</td>
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
        team: teamName, teamAr: arTeam(teamName),
        logo: teamLogo(teamName, entry.team?.logos?.[0]?.href || ""),
        played: stats.gamesPlayed || "", wins: stats.wins || "", draws: stats.ties || "",
        losses: stats.losses || "", goalDiff: stats.pointDifferential || "", points: stats.points || "",
      };
    });
    if (!entries.length) throw new Error("empty standings");
    entries.sort((a, b) => (parseInt(b.points, 10) || 0) - (parseInt(a.points, 10) || 0));
    return { seasonName: d.season?.displayName || "", entries };
  }

  async function loadStandings() {
    let stored = { entries: [] };
    try { stored = await loadJSON("data/standings.json"); renderStandings(stored); }
    catch (_) { renderStandings(stored); }
    try {
      const live = await fetchLiveStandings();
      // جدول الموسم الجديد كله أصفار قبل انطلاقه — نبقي الترتيب النهائي المخزَّن
      const played = live.entries.reduce((s, e) => s + (parseInt(e.played, 10) || 0), 0);
      if (played > 0) renderStandings({ ...live, isFinal: false });
    } catch (_) { /* المخزن يكفي */ }
  }

  /* ================= خزانة البطولات ================= */
  const TROPHIES = [
    { icon: "🌏", count: 2, label: "دوري أبطال آسيا للنخبة", years: "2025 · 2026" },
    { icon: "🏆", count: 9, label: "الدوري السعودي", years: "وفق لجنة التوثيق" },
    { icon: "👑", count: 8, label: "كأس الملك", years: "وفق لجنة التوثيق" },
    { icon: "🥇", count: 6, label: "كأس ولي العهد", years: "وفق لجنة التوثيق" },
    { icon: "⚡", count: 2, label: "كأس السوبر السعودي", years: "2016 · 2025" },
    { icon: "📜", count: 53, label: "إجمالي البطولات الرسمية", years: "التقرير النهائي — سبتمبر 2025" },
  ];

  function renderTrophies() {
    $("#trophyGrid").innerHTML = TROPHIES.map(
      (t) => `
      <div class="trophy-card">
        <div class="icon">${t.icon}</div>
        <div class="count" data-count="${t.count}">0</div>
        <div class="label">${t.label}</div>
        <div class="years">${t.years}</div>
      </div>`
    ).join("");
    const io = new IntersectionObserver((entries, obs) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        countUp(e.target, +e.target.dataset.count);
        obs.unobserve(e.target);
      });
    });
    $$("#trophyGrid .count").forEach((c) => io.observe(c));
  }

  /* ================= تصويت الجماهير ================= */
  const POLL = {
    id: "poll-2026-summer",
    q: "من تتوقع أن يكون نجم الأهلي في موسم 2026/27؟",
    opts: ["إيفان توني ⚽", "فرانشيسكو ترينكاو 🇵🇹", "إنزو ميو 🇫🇷", "فراس البريكان 🇸🇦"],
    seed: [38, 31, 16, 15],
  };

  function renderPoll() {
    const myVote = store.get(POLL.id + ":vote", null);
    const votes = store.get(POLL.id + ":votes", [...POLL.seed]);
    const total = votes.reduce((a, b) => a + b, 0) || 1;

    $("#pollBox").innerHTML = `
      <div class="poll-q">${escapeHTML(POLL.q)}</div>
      <div class="poll-opts">
        ${POLL.opts
          .map((o, i) => {
            const pct = Math.round((votes[i] / total) * 100);
            return `<button class="poll-opt ${myVote !== null ? "voted" : ""} ${myVote === i ? "mine" : ""}" data-i="${i}" ${myVote !== null ? "disabled" : ""}>
              ${myVote !== null ? `<span class="fill" style="width:${pct}%"></span>` : ""}
              <span class="txt">${escapeHTML(o)}</span>
              ${myVote !== null ? `<span class="pct">${pct}%</span>` : ""}
            </button>`;
          })
          .join("")}
      </div>
      <div class="poll-note">${myVote !== null ? `شكرًا لتصويتك! 💚 إجمالي الأصوات: ${total}` : "اختر إجابتك — صوتك محفوظ في متصفحك"}</div>`;

    $$(".poll-opt", $("#pollBox")).forEach((btn) =>
      btn.addEventListener("click", () => {
        if (store.get(POLL.id + ":vote", null) !== null) return;
        const i = +btn.dataset.i;
        const v = store.get(POLL.id + ":votes", [...POLL.seed]);
        v[i]++;
        store.set(POLL.id + ":votes", v);
        store.set(POLL.id + ":vote", i);
        renderPoll();
      })
    );
  }

  /* ================= البحث ================= */
  let searchIndex = [];

  function buildSearchIndex() {
    searchIndex = [
      ...allPlayers.map((p) => ({
        label: displayName(p),
        sub: p.roleAr || "",
        kind: "لاعب",
        photo: p.photo,
        action: () => openPlayer(p),
      })),
      ...Object.entries(AR_TEAMS).map(([en, ar]) => ({
        label: ar, sub: "دوري روشن", kind: "فريق",
        action: () => $("#standings").scrollIntoView({ behavior: "smooth" }),
      })),
      { label: "الهدافون", sub: "إحصائيات الموسم", kind: "قسم", action: () => $("#stats").scrollIntoView({ behavior: "smooth" }) },
      { label: "البطولات", sub: "خزانة الألقاب", kind: "قسم", action: () => $("#trophies").scrollIntoView({ behavior: "smooth" }) },
      { label: "الألعاب", sub: "اختبارات تفاعلية", kind: "قسم", action: () => $("#games").scrollIntoView({ behavior: "smooth" }) },
      { label: "المتجر", sub: "منتجات النادي", kind: "قسم", action: () => $("#store").scrollIntoView({ behavior: "smooth" }) },
      { label: "التشكيلة على الملعب", sub: "الخطط", kind: "قسم", action: () => $("#lineup").scrollIntoView({ behavior: "smooth" }) },
    ];
  }

  const searchPanel = $("#searchPanel"), searchInput = $("#searchInput"), searchResults = $("#searchResults");

  $("#searchBtn").addEventListener("click", () => {
    searchPanel.hidden = !searchPanel.hidden;
    if (!searchPanel.hidden) { searchInput.value = ""; runSearch(); searchInput.focus(); }
  });
  document.addEventListener("click", (e) => {
    if (!searchPanel.hidden && !e.target.closest(".search-wrap")) searchPanel.hidden = true;
  });

  function runSearch() {
    const q = normalize(searchInput.value.trim());
    const list = (q
      ? searchIndex.filter((x) => normalize(x.label).includes(q) || normalize(x.sub).includes(q))
      : searchIndex.filter((x) => x.kind === "قسم")
    ).slice(0, 10);

    searchResults.innerHTML = list.length
      ? list
          .map(
            (x, i) => `<button class="search-item" data-i="${i}">
              ${x.photo ? `<img src="${escapeHTML(x.photo)}" alt="" onerror="this.remove()">` : ""}
              <span>${escapeHTML(x.label)}<br><small style="color:var(--muted)">${escapeHTML(x.sub)}</small></span>
              <span class="kind">${escapeHTML(x.kind)}</span>
            </button>`
          )
          .join("")
      : '<div class="search-empty">لا توجد نتائج 🔍</div>';

    $$(".search-item", searchResults).forEach((btn) =>
      btn.addEventListener("click", () => {
        searchPanel.hidden = true;
        list[+btn.dataset.i].action();
      })
    );
  }
  searchInput.addEventListener("input", runSearch);

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
    { q: "كم إجمالي البطولات الرسمية للأهلي وفق التقرير النهائي؟", opts: ["53 بطولة", "43 بطولة", "60 بطولة", "35 بطولة"], a: 0 },
    { q: "في أي مدينة يقع النادي الأهلي؟", opts: ["جدة", "الرياض", "الدمام", "مكة المكرمة"], a: 0 },
    { q: "من هو حارس مرمى الأهلي الأول؟", opts: ["إدوارد ميندي", "محمد العويس", "ياسين بونو", "عبدالله المعيوف"], a: 0 },
    { q: "من أي نادٍ انتقل فرانشيسكو ترينكاو إلى الأهلي صيف 2026؟", opts: ["سبورتينغ لشبونة", "برشلونة", "بورتو", "بنفيكا"], a: 0 },
    { q: "متى دشّن الأهلي شعاره وهويته الجديدة؟", opts: ["يوليو 2025", "يناير 2024", "سبتمبر 2026", "مارس 2023"], a: 0 },
  ];

  function gameIntro(title, desc, startLabel, onStart, bestKey) {
    const best = bestKey ? store.get("best:" + bestKey, null) : null;
    gameArea.innerHTML = `
      <div class="game-intro">
        <h3>${title}</h3>
        <p>${desc}</p>
        <button class="btn btn-primary" id="gameStart">${startLabel}</button>
        ${best !== null ? `<div class="best-score">🏅 أفضل نتيجة لك: ${best}</div>` : ""}
      </div>`;
    $("#gameStart").addEventListener("click", onStart);
  }

  function gameResult(emoji, title, sub, onRetry, bestKey, score) {
    let bestNote = "";
    if (bestKey != null && score != null) {
      const prev = store.get("best:" + bestKey, null);
      const better = prev === null || score > prev;
      if (better) store.set("best:" + bestKey, score);
      bestNote = better ? "🎉 رقم قياسي جديد لك!" : `🏅 أفضل نتيجة لك: ${prev}`;
    }
    gameArea.innerHTML = `
      <div class="game-result">
        <div class="big">${emoji}</div>
        <h3>${title}</h3>
        <p>${sub}</p>
        <div class="best-score">${bestNote}</div>
        <br>
        <button class="btn btn-primary" id="gameRetry">العب من جديد 🔄</button>
      </div>`;
    $("#gameRetry").addEventListener("click", onRetry);
  }

  /* --- اختبار أهلاوي --- */
  function startQuiz() {
    const questions = shuffle(QUIZ).slice(0, 10).map((q) => ({
      q: q.q,
      opts: shuffle(q.opts.map((text, i) => ({ text, correct: i === q.a }))),
    }));
    let idx = 0, score = 0;

    function showQ() {
      if (idx >= questions.length) {
        const pct = score / questions.length;
        const emoji = pct === 1 ? "👑" : pct >= 0.7 ? "💚" : pct >= 0.4 ? "🙂" : "😅";
        const verdict = pct === 1 ? "أهلاوي ذهبي أصيل!" : pct >= 0.7 ? "أهلاوي حقيقي!" : pct >= 0.4 ? "لا بأس.. راجع تاريخ الملكي" : "تحتاج دورة مكثفة في الأهلاوية!";
        gameResult(emoji, verdict, `نتيجتك: ${score} من ${questions.length}`, startQuiz, "quiz", score);
        return;
      }
      const cur = questions[idx];
      gameArea.innerHTML = `
        <div class="quiz-progress">السؤال ${idx + 1} من ${questions.length} · النقاط: ${score}</div>
        <div class="quiz-q">${escapeHTML(cur.q)}</div><br>
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
        gameResult(emoji, `خمّنت ${score} من ${rounds.length}`, "هل تعرف لاعبي الملكي واحدًا واحدًا؟", startGuess, "guess", score);
        return;
      }
      const target = rounds[idx];
      const others = shuffle(pool.filter((p) => p !== target)).slice(0, 3);
      const opts = shuffle([target, ...others]);
      const goals = playerGoals(target);
      gameArea.innerHTML = `
        <div class="quiz-progress">اللاعب ${idx + 1} من ${rounds.length} · النقاط: ${score}</div>
        <div class="quiz-q">من هذا اللاعب؟</div>
        <div class="guess-hints">
          <div class="guess-hint">🎽 رقم القميص: <strong>${escapeHTML(target.jersey)}</strong></div>
          <div class="guess-hint">📍 المركز: <strong>${escapeHTML(target.roleAr || target.position)}</strong></div>
          <div class="guess-hint">🌍 الجنسية: <strong>${escapeHTML(target.nationalityAr || target.nationality)}</strong>
            ${target.flag ? `<img src="${escapeHTML(target.flag)}" alt="" style="width:20px;height:20px;border-radius:50%;vertical-align:middle;margin-inline-start:4px" onerror="this.remove()">` : ""}
          </div>
          <div class="guess-hint">🎂 العمر: <strong>${escapeHTML(target.age ?? "؟")} سنة</strong>${goals ? ` · ⚽ سجّل <strong>${goals}</strong> هدفًا` : ""}</div>
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

  /* --- ركلات الجزاء --- */
  function startPenalty() {
    let scored = 0, shots = 0;
    const TOTAL = 5;

    function shoot() {
      if (shots >= TOTAL) {
        const emoji = scored === TOTAL ? "🏆" : scored >= 3 ? "💚" : "😅";
        gameResult(emoji, `سجلت ${scored} من ${TOTAL}`, scored === TOTAL ? "هدّاف الملكي القادم!" : "الحارس كان يقظًا اليوم", startPenalty, "penalty", scored);
        return;
      }
      gameArea.innerHTML = `
        <div class="quiz-progress">الركلة ${shots + 1} من ${TOTAL} · سجلت: ${scored}</div>
        <div class="quiz-q">اختر زاوية التسديد — الحارس يحاول التصدي!</div><br>
        <div class="pk-goal">
          ${[0, 1, 2, 3, 4, 5].map((i) => `<div class="pk-zone" data-z="${i}">${i < 3 ? "⬆️" : "⬇️"}</div>`).join("")}
        </div>
        <div class="pk-status" id="pkStatus">🎯 اختر زاويتك</div>
        <div class="pk-score">🧤 الحارس: إدوارد ميندي</div>`;

      $$(".pk-zone", gameArea).forEach((z) =>
        z.addEventListener("click", () => {
          const pick = +z.dataset.z;
          const keeper = Math.floor(Math.random() * 6);
          shots++;
          const saved = pick === keeper;
          if (!saved) scored++;
          $$(".pk-zone", gameArea).forEach((el) => (el.style.pointerEvents = "none"));
          z.textContent = saved ? "🧤" : "⚽";
          z.style.background = saved ? "rgba(200,60,60,.55)" : "rgba(255,255,255,.65)";
          $("#pkStatus").textContent = saved ? "🧤 تصدّى لها الحارس!" : "⚽⚽ هدددددف!";
          setTimeout(shoot, 1100);
        })
      );
    }
    shoot();
  }

  /* --- لعبة الذاكرة --- */
  const MEMORY_LOGOS = [
    { id: "ahli", src: AHLI_LOGO },
    { id: "929", src: "https://a.espncdn.com/i/teamlogos/soccer/500/929.png" },
    { id: "817", src: "https://a.espncdn.com/i/teamlogos/soccer/500/817.png" },
    { id: "2276", src: "https://a.espncdn.com/i/teamlogos/soccer/500/2276.png" },
    { id: "793", src: "https://a.espncdn.com/i/teamlogos/soccer/500/793.png" },
    { id: "8363", src: "https://a.espncdn.com/i/teamlogos/soccer/500/8363.png" },
    { id: "22022", src: "https://a.espncdn.com/i/teamlogos/soccer/500/22022.png" },
    { id: "18459", src: "https://a.espncdn.com/i/teamlogos/soccer/500/18459.png" },
  ];

  function startMemory() {
    const cards = shuffle([...MEMORY_LOGOS, ...MEMORY_LOGOS].map((logo, i) => ({ ...logo, key: i })));
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
            a.classList.add("matched"); b.classList.add("matched");
            matched++;
            if (matched === MEMORY_LOGOS.length) {
              // كلما قلّت المحاولات كانت النتيجة أفضل → نحوّلها لنقاط
              const points = Math.max(0, 100 - (moves - MEMORY_LOGOS.length) * 5);
              setTimeout(() => gameResult("🧠", "ذاكرة أهلاوية حديدية!", `أنهيت اللعبة في ${moves} محاولة (${points} نقطة)`, startMemory, "memory", points), 500);
            }
          } else {
            a.classList.remove("flipped"); b.classList.remove("flipped");
          }
          flipped = [];
          lock = false;
        }, same ? 300 : 750);
      })
    );
  }

  const GAMES = {
    quiz: () => gameIntro("🧠 اختبار أهلاوي", "10 أسئلة في تاريخ الملكي ونجومه — هل أنت أهلاوي حقيقي؟", "ابدأ الاختبار", startQuiz, "quiz"),
    guess: () => gameIntro("🕵️ خمّن اللاعب", "نعطيك رقم القميص والمركز والجنسية وأهدافه الحقيقية.. وأنت تخمّن اللاعب!", "ابدأ اللعب", startGuess, "guess"),
    penalty: () => gameIntro("🥅 ركلات الجزاء", "5 ركلات أمام الحارس — اختر زاويتك وسجّل للملكي!", "اضرب الركلة", startPenalty, "penalty"),
    memory: () => gameIntro("🃏 لعبة الذاكرة", "طابق شعارات أندية دوري روشن في أقل عدد من المحاولات.", "ابدأ اللعب", startMemory, "memory"),
  };

  $("#gamesTabs").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    $$("#gamesTabs .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    GAMES[chip.dataset.game]();
  });

  /* ================= المساعد الأهلاوي الذكي ================= */
  const chatFab = $("#chatFab"), chatPanel = $("#chatPanel"), chatBody = $("#chatBody");
  const chatForm = $("#chatForm"), chatInput = $("#chatInput"), chatSuggest = $("#chatSuggest");

  const SUGGESTIONS = ["من الهداف؟", "كم نقطة الأهلي؟", "معلومات عن توني", "توقع لي مباراة", "قارن توني وترينكاو", "بطولات النادي"];

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
      b.addEventListener("click", () => { chatInput.value = b.textContent; chatForm.requestSubmit(); })
    );
  }

  function normalize(s) {
    return String(s)
      .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي")
      .replace(/[ًٌٍَُِّْ]/g, "").replace(/[؟?!.,،]/g, " ")
      .toLowerCase();
  }

  const has = (text, ...words) => words.some((w) => text.includes(normalize(w)));

  function findPlayers(text) {
    const found = [];
    for (const p of allPlayers) {
      for (const n of [p.ar, p.name].filter(Boolean)) {
        for (const part of normalize(n).split(" ")) {
          if (part.length >= 3 && text.includes(part) && !found.includes(p)) found.push(p);
        }
      }
    }
    return found;
  }

  function playerAnswer(p) {
    const stats = p.stats ? Object.entries(p.stats).map(([k, v]) => `${k}: ${v}`).join(" · ") : "";
    const g = playerGoals(p);
    return `${p.photo ? `<img src="${escapeHTML(p.photo)}" style="width:56px;height:56px;border-radius:50%;object-fit:cover;object-position:top;float:inline-start;margin-inline-end:8px" onerror="this.remove()">` : ""}
      <strong>${escapeHTML(displayName(p))}</strong> 🎽 رقم ${escapeHTML(p.jersey || "؟")}<br>
      ${escapeHTML(p.roleAr || "")} · ${escapeHTML(p.nationalityAr || "")}${p.age ? ` · ${p.age} سنة` : ""}${p.rating ? ` · ⭐ ${p.rating}` : ""}${g ? ` · ⚽ ${g} أهداف` : ""}
      ${stats ? `<br><small>${escapeHTML(stats)}</small>` : ""}
      ${p.bio ? `<br><small>${escapeHTML(p.bio)}</small>` : ""}`;
  }

  function compareAnswer(a, b) {
    const sa = a.stats || pseudoStats(a), sb = b.stats || pseudoStats(b);
    const keys = Object.keys(sa).filter((k) => k in sb);
    let wa = 0, wb = 0;
    keys.forEach((k) => (sa[k] > sb[k] ? wa++ : sb[k] > sa[k] ? wb++ : 0));
    if ((a.rating || 0) > (b.rating || 0)) wa++; else if ((b.rating || 0) > (a.rating || 0)) wb++;
    if (playerGoals(a) > playerGoals(b)) wa++; else if (playerGoals(b) > playerGoals(a)) wb++;
    const winner = wa === wb ? null : wa > wb ? a : b;
    return `⚖️ <strong>${escapeHTML(displayName(a))}</strong> ضد <strong>${escapeHTML(displayName(b))}</strong><br>
      ⚽ الأهداف: ${playerGoals(a)} — ${playerGoals(b)}<br>
      ⭐ التقييم: ${a.rating || "—"} — ${b.rating || "—"}<br>
      ${winner ? `🏆 الأفضل إجمالًا: <strong>${escapeHTML(displayName(winner))}</strong> (${Math.max(wa, wb)} مقابل ${Math.min(wa, wb)})` : "⚖️ تعادل تام!"}
      <br><small>افتح قسم «التشكيلة» لمقارنة تفصيلية بالرسوم البيانية</small>`;
  }

  function ahliRow() {
    const idx = standingsData.findIndex((e) => e.team === "Al Ahli");
    return idx >= 0 ? { ...standingsData[idx], pos: idx + 1 } : null;
  }

  function predictAnswer() {
    const next = (matchesData.upcoming || []).find((m) => m.date && new Date(m.date) > new Date());
    const form = (matchesData.results || []).slice(0, 5);
    const wins = form.filter((m) => ahliOutcome(m) === "win").length;
    if (!next) {
      return `لا توجد مباراة مجدولة حاليًا لأتوقعها 📋<br><small>لكن للعلم: الأهلي فاز في ${wins} من آخر ${form.length} مباريات، وسجّل ${seasonStats?.team?.goalsFor || 0} هدفًا هذا الموسم — التوقعات دائمًا خضراء 💚</small>`;
    }
    const opp = next.home.name === "Al Ahli" ? next.away : next.home;
    const oppIdx = standingsData.findIndex((e) => e.team === opp.name);
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

    if (has(text, "هداف", "الهدافين", "من سجل", "اكثر تسجيل")) {
      const top = (seasonStats?.scorers || []).slice(0, 5);
      if (!top.length) return "لا تتوفر أرقام الهدافين حاليًا.";
      const arOf = (n) => allPlayers.find((p) => p.name === n)?.ar || n;
      return `⚽ هدافو الفريق هذا الموسم:<br>` +
        top.map((s, i) => `${["🥇", "🥈", "🥉", "4️⃣", "5️⃣"][i]} ${escapeHTML(arOf(s.name))} — <strong>${s.value}</strong> هدفًا`).join("<br>");
    }

    if (has(text, "قارن", "مقارنه", "افضل بين", "ولا")) {
      const ps = findPlayers(text);
      if (ps.length >= 2) return compareAnswer(ps[0], ps[1]);
      return "اذكر لاعبَين لأقارن بينهما، مثل: «قارن توني وترينكاو» ⚖️";
    }

    if (has(text, "قادم", "متي المباراه", "متى", "موعد", "جدول", "مباشر", "اليوم")) {
      const now = (matchesData.live || [])[0];
      if (now) {
        return `🔴 <strong>مباشر الآن!</strong> ${escapeHTML(now.home.nameAr)} <strong>${escapeHTML(now.home.score)} - ${escapeHTML(now.away.score)}</strong> ${escapeHTML(now.away.nameAr)}<br>⏱️ ${escapeHTML(now.clock || now.statusText || "")}`;
      }
      const next = (matchesData.upcoming || []).find((m) => m.date && new Date(m.date) > new Date());
      if (next) {
        const today = new Date(next.date).toDateString() === new Date().toDateString();
        return `${today ? "🔥 <strong>المباراة اليوم!</strong><br>" : "المباراة القادمة: "}<strong>${escapeHTML(next.home.nameAr)} × ${escapeHTML(next.away.nameAr)}</strong><br>🗓️ ${formatDate(next.date)} · ⏰ ${timeHM(next.date)}<br>🏆 ${escapeHTML(next.competition)}${next.venue ? `<br>📍 ${escapeHTML(arVenue(next.venue))}` : ""}`;
      }
      return "لا توجد مباريات مجدولة حاليًا — سيظهر الجدول تلقائيًا فور اعتماده 📋";
    }

    if (has(text, "نتيجه", "نتائج", "اخر مباراه", "خسر", "فاز")) {
      const last = (matchesData.results || []).slice(0, 3);
      if (!last.length) return "لا توجد نتائج مسجلة بعد.";
      return "آخر النتائج:<br>" + last.map((m) => {
        const icon = { win: "✅", loss: "❌", draw: "➖" }[ahliOutcome(m)];
        return `${icon} ${escapeHTML(m.home.nameAr)} ${escapeHTML(m.home.score)} - ${escapeHTML(m.away.score)} ${escapeHTML(m.away.nameAr)}`;
      }).join("<br>");
    }

    if (has(text, "ترتيب", "نقطه", "نقاط", "مركز", "وصيف", "متصدر")) {
      const us = ahliRow();
      if (!us) return "جدول الترتيب غير متاح حاليًا.";
      const top = standingsData[0];
      return `الأهلي في المركز <strong>${us.pos}</strong> برصيد <strong>${escapeHTML(us.points)}</strong> نقطة (${escapeHTML(us.wins)} فوز، ${escapeHTML(us.draws)} تعادل، ${escapeHTML(us.losses)} خسارة)${top && top.team !== "Al Ahli" ? `<br><small>المتصدر: ${escapeHTML(top.teamAr)} بـ${escapeHTML(top.points)} نقطة</small>` : " — متصدرين! 🔝"}`;
    }

    if (has(text, "احصائ", "استحواذ", "تسديد", "اهداف الفريق")) {
      const t = seasonStats?.team;
      if (!t) return "الإحصائيات غير متاحة حاليًا.";
      return `📊 إحصائيات الموسم (${seasonStats.matchesAnalyzed} مباراة):<br>
        ⚽ سجّلنا <strong>${t.goalsFor}</strong> واستقبلنا <strong>${t.goalsAgainst}</strong><br>
        🎯 متوسط التسديدات: ${t.avgShots} · 🚩 الركنيات: ${t.avgCorners}<br>
        ⏱️ متوسط الاستحواذ: ${t.avgPossession}%`;
    }

    if (has(text, "توقع", "تكهن", "تحليل", "من يفوز")) return predictAnswer();

    if (has(text, "خبر", "اخبار", "جديد", "صفقه", "صفقات", "انتقال")) {
      const top = newsItems.slice(0, 3);
      if (!top.length) return "لم أجد أخبارًا الآن — جرّب قسم الأخبار بالأعلى.";
      return "آخر الأخبار:<br>" + top.map((n) => `📰 <a href="${escapeHTML(n.link)}" target="_blank" rel="noopener">${escapeHTML(n.title)}</a>`).join("<br>");
    }

    if (has(text, "مدرب", "يايسله", "بوسيتش", "جهاز فني", "مدير فني")) {
      const c = clubData.coach;
      if (!c) return "بيانات الجهاز الفني غير متاحة حاليًا.";
      if (has(text, "يايسله")) {
        return `ماتياس يايسله رحل عن الأهلي في أغسطس 2026 لتدريب نيوكاسل يونايتد 🏴 — بعدما قاد الملكي للقب الآسيوي نسختين متتاليتين 2025 و2026 🏆🏆<br>خلفه الآن: <strong>${escapeHTML(c.name)}</strong>.`;
      }
      return `المدير الفني الحالي: <strong>${escapeHTML(c.name)}</strong> (${escapeHTML(c.nationality || "")})${c.since ? ` — منذ ${escapeHTML(c.since)}` : ""}${c.contract ? ` بعقد ${escapeHTML(c.contract)}` : ""}<br><small>${escapeHTML(c.note || "")}</small>`;
    }

    if (has(text, "متجر", "قميص", "شراء", "اشتري", "سعر", "منتج")) {
      const ps = (storeData.products || []).slice(0, 4);
      if (!ps.length) return "منتجات المتجر غير متاحة حاليًا — جرّب قسم المتجر بالأسفل.";
      return "🛍️ من المتجر الرسمي:<br>" +
        ps.map((p) => `• <a href="${escapeHTML(p.url)}" target="_blank" rel="noopener">${escapeHTML(p.nameAr || p.name)}</a> — <strong>${p.price}</strong> ر.س`).join("<br>");
    }

    if (has(text, "بطوله", "بطولات", "القاب", "لقب", "توثيق", "انجاز")) {
      return `سجل الأهلي وفق لجنة توثيق البطولات 📜:<br>
        🌏 دوري أبطال آسيا للنخبة: <strong>مرتان</strong> (2025، 2026)<br>
        🏆 الدوري السعودي: <strong>9</strong> · كأس الملك: <strong>8</strong> · كأس ولي العهد: <strong>6</strong><br>
        📜 الإجمالي: <strong>53 بطولة رسمية</strong> + لقب آسيا 2026`;
    }

    if (has(text, "تشكيله", "كم لاعب", "لاعبين", "قائمه", "خطه")) {
      const by = { GK: 0, DF: 0, MF: 0, FW: 0 };
      allPlayers.forEach((p) => by[p.position] !== undefined && by[p.position]++);
      return `قائمة الفريق الأول تضم <strong>${allPlayers.length}</strong> لاعبًا:<br>🧤 ${by.GK} حراس · 🛡️ ${by.DF} مدافعًا · ⚙️ ${by.MF} وسطًا · ⚡ ${by.FW} مهاجمًا<br><small>شاهد التشكيلة على أرض الملعب بخطط مختلفة في قسم «التشكيلة»!</small>`;
    }

    if (has(text, "تاسس", "تاريخ", "متي انشئ")) {
      return "تأسس النادي الأهلي عام <strong>1937</strong> في جدة، ويُلقب بالملكي والقلعة الخضراء، وشعاره الخالد: «وعبر الزمان سنمضي معًا» 💚";
    }

    if (has(text, "ملعب", "استاد", "الجوهره")) {
      return "يلعب الأهلي على ملعب <strong>الإنماء</strong> (الجوهرة المشعة) في مدينة الملك عبدالله الرياضية بجدة، بسعة تتجاوز 62 ألف متفرج 🏟️";
    }

    if (has(text, "شعار", "هويه", "خط")) {
      return "دشّن النادي شعاره وهويته الجديدة في <strong>يوليو 2025</strong> — احتفظ بالأخضر والأبيض وعبارة «وعبر الزمان سنمضي معًا» وتاريخ التأسيس 1937 ✨ وهذا الموقع يستخدم خط النادي الرسمي!";
    }

    const players = findPlayers(text);
    if (players.length >= 2) return compareAnswer(players[0], players[1]);
    if (players.length === 1) return playerAnswer(players[0]);

    if (has(text, "سلام", "مرحبا", "هلا", "اهلين", "صباح", "مساء")) {
      return "هلا والله بأهلاوي أصيل! 💚 اسألني عن أي شيء يخص الملكي: اللاعبين، الهدافين، الترتيب، الإحصائيات، أو اطلب مقارنة أو توقعًا!";
    }

    return `لم أفهم سؤالك تمامًا 🤔 جرّب أن تسألني عن:<br>
      ⚽ لاعب بالاسم · ⚖️ «قارن توني وترينكاو»<br>
      🥅 «من الهداف؟» · 🏅 «كم نقطة الأهلي؟»<br>
      📊 «إحصائيات الموسم» · 🔮 «توقع لي مباراة»`;
  }

  function botReply(userText) {
    const typing = chatMsg('<span class="typing">يفكر…</span>');
    setTimeout(() => {
      typing.innerHTML = answer(userText);
      chatBody.scrollTop = chatBody.scrollHeight;
    }, 420 + Math.random() * 450);
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
    const products = data.products || [];
    if (!products.length) {
      $("#storeGrid").innerHTML = '<div class="loader">تعذّر تحميل منتجات المتجر حاليًا.</div>';
      return;
    }
    $("#storeGrid").innerHTML = products
      .map((p) => {
        const name = p.nameAr || p.name;
        const link = p.url || data.officialStoreUrl;
        return `
      <a class="store-card" href="${escapeHTML(link)}" target="_blank" rel="noopener">
        <div class="store-img">
          ${p.image
            ? `<img src="${escapeHTML(p.image)}" alt="${escapeHTML(name)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'👕',className:'store-fallback'}))">`
            : '<span class="store-fallback">👕</span>'}
          ${p.onSale ? '<span class="store-badge sale">تخفيض 🔥</span>' : ""}
          ${p.outOfStock ? '<span class="store-badge out">نفدت الكمية</span>' : ""}
        </div>
        <div class="store-body">
          <h3>${escapeHTML(name)}</h3>
          <div class="store-foot">
            <span class="price">
              ${p.price} <small>ر.س</small>
              ${p.oldPrice ? `<s class="old">${p.oldPrice}</s>` : ""}
            </span>
            <span class="btn btn-small">اطلبه ↗</span>
          </div>
        </div>
      </a>`;
      })
      .join("");
    $("#storeNote").innerHTML = `منتجات حقيقية من <a href="${escapeHTML(data.officialStoreUrl)}" target="_blank" rel="noopener">المتجر الرسمي للنادي ↗</a> — الأسعار والتوفر يتحدثان تلقائيًا.`;
  }

  /* ================= الإقلاع ================= */
  loadNews();
  loadPlayers().then(() => GAMES.quiz());
  loadMatches();
  loadStandings();
  renderTrophies();
  renderPoll();
  loadJSON("data/store.json")
    .then((d) => { storeData = d; renderStore(d); })
    .catch(() => renderStore({ products: [] }));

  if ("serviceWorker" in navigator) {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
})();
