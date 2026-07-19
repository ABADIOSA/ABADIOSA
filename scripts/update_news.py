#!/usr/bin/env python3
"""تحديث أخبار النادي الأهلي السعودي تلقائيًا.

يجلب آخر الأخبار من Google News RSS ويكتبها في data/news.json.
يعمل عبر GitHub Actions بشكل مجدول، ولا يحتاج أي مكتبات خارجية.
"""
import json
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

QUERY = '"النادي الأهلي السعودي" OR "الأهلي السعودي"'
RSS_URL = (
    "https://news.google.com/rss/search?q="
    + urllib.parse.quote(QUERY)
    + "&hl=ar&gl=SA&ceid=SA:ar"
)
OUTPUT = Path(__file__).resolve().parent.parent / "data" / "news.json"
MAX_ITEMS = 20


def fetch_rss(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (news-bot)"})
    with urllib.request.urlopen(req, timeout=30) as res:
        return res.read().decode("utf-8", errors="replace")


def parse_items(xml_text: str) -> list[dict]:
    root = ET.fromstring(xml_text)
    items = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        source = (item.findtext("source") or "").strip()
        pub = (item.findtext("pubDate") or "").strip()

        # عناوين Google News تنتهي بـ " - اسم المصدر"
        m = re.match(r"^(.*)\s-\s([^-]+)$", title)
        if m and len(m.group(1)) > 10:
            title = m.group(1).strip()
            if not source:
                source = m.group(2).strip()

        try:
            date = parsedate_to_datetime(pub).isoformat()
        except (TypeError, ValueError):
            date = ""

        if title and link:
            items.append({"title": title, "link": link, "source": source, "date": date})
        if len(items) >= MAX_ITEMS:
            break
    return items


def main() -> None:
    items = parse_items(fetch_rss(RSS_URL))
    if not items:
        print("لم يتم العثور على أخبار — الإبقاء على الملف الحالي.")
        return

    data = {
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "google-news-rss",
        "items": items,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"تم تحديث {len(items)} خبرًا في {OUTPUT}")


if __name__ == "__main__":
    main()
