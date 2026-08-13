#!/usr/bin/env python3
"""تحديث بيانات النادي الأهلي السعودي تلقائيًا من واجهة ESPN العامة.

يجلب: التشكيلة الحقيقية، المباريات (القادمة والنتائج)، جدول ترتيب الدوري،
ومعلومات النادي — ويكتبها في ملفات JSON يقرؤها الموقع.
يعمل عبر GitHub Actions بشكل مجدول، ولا يحتاج أي مفاتيح أو مكتبات خارجية.
"""
import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

TEAM_ID = "8346"  # الأهلي السعودي في ESPN
TEAM_NAME = "Al Ahli"
LEAGUE = "ksa.1"  # دوري روشن السعودي
BASE = f"https://site.api.espn.com/apis/site/v2/sports/soccer/{LEAGUE}"
STANDINGS_URL = f"https://site.api.espn.com/apis/v2/sports/soccer/{LEAGUE}/standings"
SCOREBOARD = f"{BASE}/scoreboard"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# متجر النادي الرسمي (منصة سلة)
STORE_ID = "1594883879"
STORE_API = "https://api.salla.dev/store/v1/products?per_page=40"
STORE_URL = "https://store.alahlifc.sa/ar"

# الشعار الجديد للنادي (هوية 2025) — شعار ESPN قديم
NEW_CREST = "https://upload.wikimedia.org/wikipedia/ar/thumb/3/3e/Al-Ahli_SFC_%282025%29.svg/langar-330px-Al-Ahli_SFC_%282025%29.svg.png"

# أسماء أندية دوري روشن بالعربية
AR_TEAMS = {
    "Al Ahli": "الأهلي",
    "Abha": "أبها",
    "Al Diriyah": "الدرعية",
    "Al-Faisaly": "الفيصلي",
    "Al Faisaly": "الفيصلي",
    "Al Ettifaq": "الاتفاق",
    "Al Fateh": "الفتح",
    "Al Fayha": "الفيحاء",
    "Al Hazem": "الحزم",
    "Al Hilal": "الهلال",
    "Al Ittihad": "الاتحاد",
    "Al Khaleej": "الخليج",
    "Al Kholood": "الخلود",
    "Al Najma": "النجمة",
    "Al Nassr": "النصر",
    "Al Okhdood": "الأخدود",
    "Al Qadsiah": "القادسية",
    "Al Riyadh": "الرياض",
    "Al Shabab": "الشباب",
    "Al Taawoun": "التعاون",
    "Damac": "ضمك",
    "Neom SC": "نيوم",
}

AR_COUNTRIES = {
    "Saudi Arabia": "السعودية", "Algeria": "الجزائر", "England": "إنجلترا",
    "Brazil": "البرازيل", "France": "فرنسا", "Senegal": "السنغال",
    "Ivory Coast": "ساحل العاج", "Türkiye": "تركيا", "Turkey": "تركيا",
    "Belgium": "بلجيكا", "Nigeria": "نيجيريا", "Chad": "تشاد",
    "Morocco": "المغرب", "Egypt": "مصر", "Tunisia": "تونس",
    "Portugal": "البرتغال", "Spain": "إسبانيا", "Argentina": "الأرجنتين",
    "Cameroon": "الكاميرون", "Ghana": "غانا", "Mali": "مالي",
}

POS_MAP = {"G": "GK", "D": "DF", "M": "MF", "F": "FW"}
POS_AR = {"G": "حارس مرمى", "D": "مدافع", "M": "لاعب وسط", "F": "مهاجم"}


def get(url: str, retries: int = 2):
    req = urllib.request.Request(url, headers={"User-Agent": "AhliFanSite/1.0 (github.com/ABADIOSA/ABADIOSA)"})
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                return json.load(res)
        except Exception:
            if attempt == retries:
                raise
            time.sleep(1.5 * (attempt + 1))


def ar_team(name: str) -> str:
    return AR_TEAMS.get(name, name)


def ar_country(name: str) -> str:
    return AR_COUNTRIES.get(name, name)


def team_logo(name: str, fallback: str) -> str:
    """شعار الأهلي الجديد بدل شعار ESPN القديم، والبقية من ESPN."""
    return NEW_CREST if name == "Al Ahli" else fallback


_photo_cache: dict = {}


FOOT_WORDS = ("footballer", "football", "soccer", "goalkeeper", "winger",
              "midfielder", "defender", "forward", "striker", "manager", "coach")


def photo_ok(url: str) -> bool:
    """التأكد أن رابط الصورة يعمل فعلًا قبل اعتماده."""
    if not url:
        return False
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "AhliFanSite/1.0"})
        with urllib.request.urlopen(req, timeout=15) as res:
            return res.status == 200 and "image" in res.headers.get("Content-Type", "")
    except Exception:
        return False


def wiki_photo(name: str, hint: str = "footballer") -> str:
    """صورة اللاعب من ويكيبيديا: نبحث بعدة صيغ، ونتحقق أن الصفحة رياضية والصورة تعمل."""
    if name in _photo_cache:
        return _photo_cache[name]

    photo = ""
    queries = [f"{name} {hint}", f"{name} Al Ahli", name]
    for q in queries:
        if photo:
            break
        time.sleep(0.25)  # احترام حدود معدل الطلبات
        try:
            enc = urllib.parse.quote(q)
            s = get(f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={enc}&format=json&srlimit=3")
            for hit in s.get("query", {}).get("search", [])[:3]:
                title = urllib.parse.quote(hit["title"].replace(" ", "_"))
                summary = get(f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}")
                blurb = f"{summary.get('description', '')} {summary.get('extract', '')}".lower()
                if not any(w in blurb for w in FOOT_WORDS):
                    continue  # صفحة لشخص آخر يحمل الاسم نفسه
                candidate = (summary.get("thumbnail") or {}).get("source", "")
                if photo_ok(candidate):
                    photo = candidate
                    break
        except Exception:
            continue

    _photo_cache[name] = photo
    return photo


def load_overrides() -> dict:
    """قراءة تصحيحات التشكيلة اليدوية (الراحلون والصفقات الجديدة) من players.json."""
    try:
        meta = json.loads((DATA_DIR / "players.json").read_text(encoding="utf-8"))
        return {"departed": meta.get("departed", []), "signings": meta.get("signings", [])}
    except Exception:
        return {"departed": [], "signings": []}


def write(name: str, payload: dict) -> None:
    payload["updatedAt"] = datetime.now(timezone.utc).isoformat()
    path = DATA_DIR / name
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ {path.name}")


def update_team() -> None:
    d = get(f"{BASE}/teams/{TEAM_ID}")
    team = d["team"]
    write("team.json", {
        "id": team["id"],
        "name": team.get("displayName"),
        "nameAr": ar_team(team.get("displayName", "")),
        "logo": NEW_CREST,
        "record": (team.get("record", {}).get("items") or [{}])[0].get("summary", ""),
        "standingSummary": team.get("standingSummary", ""),
        "staff": load_staff(),
    })


def load_staff() -> list:
    """الجهاز الفني من players.json مع جلب صور الأعضاء تلقائيًا."""
    try:
        meta = json.loads((DATA_DIR / "players.json").read_text(encoding="utf-8"))
    except Exception:
        return []
    staff = []
    for member in meta.get("staff", []):
        m = dict(member)
        if not m.get("photo") and m.get("wiki"):
            m["photo"] = wiki_photo(m["wiki"], "football manager")
        staff.append(m)
    return staff


def update_squad() -> None:
    d = get(f"{BASE}/teams/{TEAM_ID}/roster")
    overrides = load_overrides()
    departed = set(overrides["departed"])
    players = []
    for a in d.get("athletes") or []:
        name = a.get("fullName") or a.get("displayName")
        if name in departed:
            continue  # لاعب غادر النادي ولم تحدّث ESPN قائمتها بعد
        pos = (a.get("position") or {}).get("abbreviation", "")
        citizenship = a.get("citizenship") or ""
        players.append({
            "id": a.get("id"),
            "name": name,
            "jersey": a.get("jersey"),
            "position": POS_MAP.get(pos, pos),
            "roleAr": POS_AR.get(pos, ""),
            "age": a.get("age"),
            "height": a.get("displayHeight"),
            "nationality": citizenship,
            "nationalityAr": ar_country(citizenship),
            "flag": (a.get("flag") or {}).get("href", ""),
            "photo": wiki_photo(name),
        })
    # الصفقات الجديدة الموثقة يدويًا التي لم تصل بعد لقائمة ESPN
    existing = {p["name"] for p in players}
    for s in overrides["signings"]:
        if s.get("name") in existing:
            continue
        s = dict(s)
        s.setdefault("id", f"manual-{s['name']}")
        s.setdefault("photo", wiki_photo(s["name"]))
        players.append(s)
    write("squad.json", {"source": "espn+manual", "players": players})


def competition_ar(name: str) -> str:
    if not name or "Saudi Pro League" in name:
        return "دوري روشن السعودي"
    if "King" in name and "Cup" in name:
        return "كأس خادم الحرمين الشريفين"
    if "Champions" in name and "Elite" in name:
        return "دوري أبطال آسيا للنخبة"
    if "Super" in name:
        return "كأس السوبر السعودي"
    return name


def scoreboard_events(start: datetime, end: datetime) -> list:
    """مباريات الدوري في نطاق زمني — تعمل حتى قبل انطلاق الموسم رسميًا."""
    rng = f"{start.strftime('%Y%m%d')}-{end.strftime('%Y%m%d')}"
    try:
        data = get(f"{SCOREBOARD}?dates={rng}&limit=500")
    except Exception as exc:
        print(f"تعذّر جلب السكوربورد {rng}: {exc}")
        return []
    out = []
    for e in data.get("events") or []:
        comp = (e.get("competitions") or [{}])[0]
        names = [(c.get("team") or {}).get("displayName") for c in comp.get("competitors") or []]
        if TEAM_NAME in names:
            out.append(e)
    return out


def parse_event(e: dict) -> dict:
    comp = (e.get("competitions") or [{}])[0]
    status = comp.get("status") or {}
    stype = status.get("type") or {}
    match = {
        "id": e.get("id"),
        "date": e.get("date"),
        "competition": competition_ar((e.get("league") or comp.get("league") or {}).get("name", "")),
        "state": stype.get("state", ""),           # pre / in / post
        "statusText": stype.get("shortDetail", ""),
        "clock": status.get("displayClock", ""),
        "venue": (comp.get("venue") or {}).get("fullName", ""),
    }
    for c in comp.get("competitors") or []:
        team = c.get("team") or {}
        name = team.get("displayName", "")
        score = c.get("score")
        match["home" if c.get("homeAway") == "home" else "away"] = {
            "name": name,
            "nameAr": ar_team(name),
            "logo": team_logo(name, (team.get("logos") or [{}])[0].get("href", "") or team.get("logo", "")),
            "score": score.get("displayValue", "") if isinstance(score, dict) else str(score or ""),
        }
    return match


def update_matches() -> None:
    now = datetime.now(timezone.utc)
    events = scoreboard_events(now - timedelta(days=60), now + timedelta(days=150))
    upcoming, results, live = [], [], []

    for e in events:
        m = parse_event(e)
        if "home" not in m or "away" not in m:
            continue
        if m["state"] == "post":
            results.append(m)
        elif m["state"] == "in":
            live.append(m)
        else:
            upcoming.append(m)

    # أرشيف الموسم المكتمل حين لا توجد نتائج بعد في الموسم الجديد
    archive = []
    if not results:
        for season in (now.year - 1, now.year - 2):
            try:
                evs = get(f"{BASE}/teams/{TEAM_ID}/schedule?season={season}").get("events") or []
            except Exception:
                evs = []
            if evs:
                for e in evs:
                    m = parse_event(e)
                    if "home" in m and "away" in m and m["state"] == "post":
                        archive.append(m)
                if archive:
                    print(f"لا نتائج في الموسم الجديد — أرشيف موسم {season}: {len(archive)} مباراة.")
                    break

    upcoming.sort(key=lambda m: m["date"] or "")
    results.sort(key=lambda m: m["date"] or "", reverse=True)
    archive.sort(key=lambda m: m["date"] or "", reverse=True)

    write("matches_auto.json", {
        "source": "espn-scoreboard",
        "live": live,
        "upcoming": upcoming[:12],
        "results": results[:12],
        "archive": archive[:12],
        "archiveLabel": "نتائج الموسم الماضي" if archive else "",
    })
    # الإحصائيات تُحسب من مباريات انتهت (الموسم الحالي أو الأرشيف)
    source = results or archive
    update_season_stats([m["id"] for m in source if m.get("id")], source)


def update_season_stats(event_ids: list, results: list) -> None:
    """حساب الهدافين وصانعي الفارق وإحصائيات الموسم من ملخصات المباريات."""
    goals, assists, cards = {}, {}, {}
    shots_total = corners = possession_sum = matches_counted = 0

    for eid in event_ids[:40]:
        try:
            s = get(f"{BASE}/summary?event={eid}")
        except Exception:
            continue
        for ev in s.get("keyEvents") or []:
            if (ev.get("team") or {}).get("id") != TEAM_ID:
                continue
            kind = (ev.get("type") or {}).get("type", "")
            parts = ev.get("participants") or []
            names = [(p.get("athlete") or {}).get("displayName") for p in parts]
            names = [n for n in names if n]
            if kind == "goal" and names:
                goals[names[0]] = goals.get(names[0], 0) + 1
                if len(names) > 1:
                    assists[names[1]] = assists.get(names[1], 0) + 1
            elif kind in ("yellow-card", "red-card") and names:
                cards[names[0]] = cards.get(names[0], 0) + 1
        # إحصائيات الفريق في المباراة
        for t in (s.get("boxscore") or {}).get("teams") or []:
            if (t.get("team") or {}).get("id") != TEAM_ID:
                continue
            stats = {x.get("name"): x.get("displayValue", "") for x in (t.get("statistics") or [])}
            try:
                shots_total += int(stats.get("totalShots") or 0)
                corners += int(stats.get("wonCorners") or 0)
                possession_sum += float((stats.get("possessionPct") or "0").replace("%", ""))
                matches_counted += 1
            except ValueError:
                pass
        time.sleep(0.15)

    def top(counter: dict, limit: int = 8) -> list:
        return [{"name": k, "value": v} for k, v in sorted(counter.items(), key=lambda x: -x[1])[:limit]]

    scored = sum(int(m["home"]["score"] or 0) if m["home"]["name"] == "Al Ahli" else int(m["away"]["score"] or 0)
                 for m in results if m["home"]["score"].isdigit() and m["away"]["score"].isdigit())
    conceded = sum(int(m["away"]["score"] or 0) if m["home"]["name"] == "Al Ahli" else int(m["home"]["score"] or 0)
                   for m in results if m["home"]["score"].isdigit() and m["away"]["score"].isdigit())

    write("stats.json", {
        "source": "espn-summaries",
        "matchesAnalyzed": len(event_ids[:40]),
        "scorers": top(goals),
        "assists": top(assists),
        "cards": top(cards, 5),
        "team": {
            "goalsFor": scored,
            "goalsAgainst": conceded,
            "avgShots": round(shots_total / matches_counted, 1) if matches_counted else 0,
            "avgCorners": round(corners / matches_counted, 1) if matches_counted else 0,
            "avgPossession": round(possession_sum / matches_counted, 1) if matches_counted else 0,
        },
    })


def parse_standings(payload: dict) -> tuple:
    children = payload.get("children") or []
    if not children:
        return "", []
    entries = []
    for entry in children[0]["standings"]["entries"]:
        team = entry["team"]
        stats = {s["name"]: s.get("displayValue", "") for s in entry.get("stats", [])}
        entries.append({
            "team": team.get("displayName", ""),
            "teamAr": ar_team(team.get("displayName", "")),
            "logo": team_logo(team.get("displayName", ""), (team.get("logos") or [{}])[0].get("href", "")),
            "played": stats.get("gamesPlayed", ""),
            "wins": stats.get("wins", ""),
            "draws": stats.get("ties", ""),
            "losses": stats.get("losses", ""),
            "goalDiff": stats.get("pointDifferential", ""),
            "points": stats.get("points", ""),
        })
    entries.sort(key=lambda x: (-int(x["points"] or 0), x["teamAr"]))
    season = payload.get("season") or {}
    return (season.get("displayName", "") if isinstance(season, dict) else ""), entries


def update_standings() -> None:
    name, entries = parse_standings(get(STANDINGS_URL))
    played = sum(int(e["played"] or 0) for e in entries)

    # الموسم لم ينطلق: الجدول كله أصفار — نعرض ترتيب الموسم الماضي بوضوح
    if entries and played == 0:
        year = datetime.now(timezone.utc).year
        for season in (year - 1, year - 2):
            try:
                prev_name, prev_entries = parse_standings(get(f"{STANDINGS_URL}?season={season}"))
            except Exception:
                continue
            if prev_entries and sum(int(e["played"] or 0) for e in prev_entries) > 0:
                print(f"الموسم الجديد لم ينطلق — عرض ترتيب {prev_name}.")
                write("standings.json", {
                    "source": "espn",
                    "seasonName": prev_name,
                    "isFinal": True,
                    "entries": prev_entries,
                })
                return

    write("standings.json", {"source": "espn", "seasonName": name, "isFinal": False, "entries": entries})


def update_store() -> None:
    """منتجات المتجر الرسمي (منصة سلة) بالصور والأسعار وروابط الشراء."""
    req = urllib.request.Request(
        STORE_API,
        headers={"User-Agent": "AhliFanSite/1.0", "Store-Identifier": STORE_ID},
    )
    with urllib.request.urlopen(req, timeout=30) as res:
        data = json.load(res)
    if not data.get("success"):
        raise RuntimeError("واجهة المتجر لم تستجب")

    products, seen = [], set()
    for p in data.get("data", []):
        name = (p.get("name") or "").strip()
        if not name or name in seen:
            continue  # المتجر يكرر بعض المنتجات بمقاسات مختلفة
        seen.add(name)
        price = p.get("price")
        price = price.get("amount") if isinstance(price, dict) else price
        sale = p.get("sale_price")
        sale = sale.get("amount") if isinstance(sale, dict) else sale
        image = p.get("image") or {}
        products.append({
            "name": name,
            "nameAr": store_name_ar(name),
            "price": sale or price,
            "oldPrice": price if sale else None,
            "image": image.get("url", "") if isinstance(image, dict) else "",
            "url": p.get("url") or STORE_URL,
            "onSale": bool(sale),
            "outOfStock": bool(p.get("is_out_of_stock")),
        })

    write("store.json", {
        "source": "salla-official-store",
        "officialStoreUrl": STORE_URL,
        "products": products[:24],
    })


# الترتيب مهم: العبارات الأطول أولًا كي لا تُقطّعها الكلمات المفردة
STORE_WORDS = [
    ("Away Shirt", "القميص الاحتياطي"), ("Home Shirt", "القميص الأساسي"),
    ("Third Shirt", "القميص الثالث"),
    ("Pre Match Away Jersey", "قميص ما قبل المباراة الاحتياطي"),
    ("Pre Match Home Jersey", "قميص ما قبل المباراة الأساسي"),
    ("Home Replica Short", "شورت الطقم الأساسي"),
    ("Away Shorts - Replica", "شورت الطقم الاحتياطي"),
    ("Away Shorts", "شورت الطقم الاحتياطي"),
    ("Home Shorts", "شورت الطقم الأساسي"),
    ("Asia Champion", "بطل آسيا"), ("Asia is Green", "آسيا خضراء"),
    ("Goalkeeper", "حارس المرمى"),
    ("Pre-Match", "ما قبل المباراة"), ("Pre Match", "ما قبل المباراة"),
    ("Sleeveless Top", "قطعة علوية بلا أكمام"), ("1/4 Zip Top", "قطعة علوية بسحّاب"),
    ("Training", "تدريب"), ("Travel", "سفر"),
    ("Shorts", "شورت"), ("Short", "شورت"), ("Pants", "بنطال"),
    ("Jacket", "جاكيت"), ("Hoodie", "هودي"), ("Polo", "بولو"),
    ("Jersey", "قميص"), ("Shirt", "قميص"), ("Tee", "تيشيرت"), ("Top", "قطعة علوية"),
    ("Replica", "نسخة الجماهير"), ("Logo", "بالشعار"),
    ("Men's", "رجالي"), ("Women's", "نسائي"), ("Kids", "أطفال"),
    ("Graphic", "مطبوع"), ("Scarf", "شماغ"), ("Cap", "كاب"), ("Socks", "جوارب"),
    ("Away", "الاحتياطي"), ("Home", "الأساسي"), ("Third", "الثالث"),
]


def store_name_ar(name: str) -> str:
    """ترجمة مبسطة لاسم المنتج مع الإبقاء على رقم الموسم."""
    out = name.replace("Al Ahly's", "الأهلي").replace("Al Ahli", "الأهلي").replace("Al Ahly", "الأهلي")
    for en, ar in STORE_WORDS:
        out = out.replace(en, ar)
    out = out.replace(" - ", " ")
    return " ".join(out.split())


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for step in (update_team, update_squad, update_matches, update_standings, update_store):
        try:
            step()
        except Exception as exc:  # خطوة فاشلة لا تُسقط البقية — نبقي الملف القديم
            print(f"تعذّر {step.__name__}: {exc}")


if __name__ == "__main__":
    main()
