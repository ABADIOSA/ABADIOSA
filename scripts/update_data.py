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
from datetime import datetime, timezone
from pathlib import Path

TEAM_ID = "8346"  # الأهلي السعودي في ESPN
LEAGUE = "ksa.1"  # دوري روشن السعودي
BASE = f"https://site.api.espn.com/apis/site/v2/sports/soccer/{LEAGUE}"
STANDINGS_URL = f"https://site.api.espn.com/apis/v2/sports/soccer/{LEAGUE}/standings"
DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# الشعار الجديد للنادي (هوية 2025) — شعار ESPN قديم
NEW_CREST = "https://upload.wikimedia.org/wikipedia/ar/thumb/3/3e/Al-Ahli_SFC_%282025%29.svg/langar-330px-Al-Ahli_SFC_%282025%29.svg.png"

# أسماء أندية دوري روشن بالعربية
AR_TEAMS = {
    "Al Ahli": "الأهلي",
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


def wiki_photo(name: str, hint: str = "footballer") -> str:
    """جلب صورة اللاعب من ويكيبيديا (بحث ثم ملخص الصفحة)."""
    if name in _photo_cache:
        return _photo_cache[name]
    photo = ""
    time.sleep(0.3)  # احترام حدود معدل الطلبات في ويكيبيديا
    try:
        q = urllib.parse.quote(f"{name} {hint}")
        s = get(f"https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch={q}&format=json&srlimit=1")
        hits = s.get("query", {}).get("search", [])
        if hits:
            title = urllib.parse.quote(hits[0]["title"].replace(" ", "_"))
            summary = get(f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}")
            photo = (summary.get("thumbnail") or {}).get("source", "")
    except Exception:
        photo = ""
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
        "coach": {
            "name": "ماتياس يايسله",
            "nationality": "ألمانيا",
            "photo": wiki_photo("Matthias Jaissle", "football manager"),
        },
    })


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


def update_matches() -> None:
    d = get(f"{BASE}/teams/{TEAM_ID}/schedule")
    upcoming, results = [], []
    for e in d.get("events") or []:
        comp = e["competitions"][0]
        state = comp.get("status", {}).get("type", {}).get("state", "")
        comp_name = (e.get("league") or {}).get("name") or ""
        if "Saudi Pro League" in comp_name or not comp_name:
            comp_name = "دوري روشن السعودي"
        elif "King" in comp_name and "Cup" in comp_name:
            comp_name = "كأس خادم الحرمين الشريفين"
        match = {"date": e.get("date"), "competition": comp_name}
        for c in comp.get("competitors") or []:
            team = c.get("team") or {}
            side = {
                "name": team.get("displayName", ""),
                "nameAr": ar_team(team.get("displayName", "")),
                "logo": team_logo(team.get("displayName", ""), (team.get("logos") or [{}])[0].get("href", "") or team.get("logo", "")),
                "score": (c.get("score") or {}).get("displayValue", "") if isinstance(c.get("score"), dict) else str(c.get("score") or ""),
                "winner": c.get("winner"),
            }
            match["home" if c.get("homeAway") == "home" else "away"] = side
        if "home" not in match or "away" not in match:
            continue
        (results if state == "post" else upcoming).append(match)
    upcoming.sort(key=lambda m: m["date"] or "")
    results.sort(key=lambda m: m["date"] or "", reverse=True)
    write("matches_auto.json", {"source": "espn", "upcoming": upcoming[:10], "results": results[:10]})


def update_standings() -> None:
    d = get(STANDINGS_URL)
    children = d.get("children") or []
    if not children:
        print("لا يوجد جدول ترتيب متاح حاليًا.")
        return
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
    entries.sort(key=lambda x: int(x["points"] or 0), reverse=True)
    season = (d.get("season") or {})
    write("standings.json", {
        "source": "espn",
        "seasonName": season.get("displayName", "") if isinstance(season, dict) else "",
        "entries": entries,
    })


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for step in (update_team, update_squad, update_matches, update_standings):
        try:
            step()
        except Exception as exc:  # خطوة فاشلة لا تُسقط البقية — نبقي الملف القديم
            print(f"تعذّر {step.__name__}: {exc}")


if __name__ == "__main__":
    main()
