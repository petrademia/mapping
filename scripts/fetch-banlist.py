#!/usr/bin/env python3
"""Write public/banlist.json: OCG from the Project Ignis LFLists, TCG from the
official Konami list page, and the Asian-English (AE) list from the
DawnbrandBots limit-regulation data (a copy of the official AE list).

Each list maps a passcode to the copies allowed in a deck: 0 forbidden,
1 limited, 2 semi-limited. A card that is absent is unlimited (3 copies).

Usage: fetch-banlist.py
"""
import json
import re
import urllib.request
import unicodedata
from pathlib import Path

BASE = "https://raw.githubusercontent.com/ProjectIgnis/LFLists/master/"
LISTS = {"ocg": "OCG.lflist.conf"}
# The TCG page for the list currently in effect. Bump this when a new list lands.
TCG_URL = "https://www.yugioh-card.com/en/limited/list_2026-09-21/"
TCG_NAME = "2026-09-21 TCG"
AE_URL = (
    "https://raw.githubusercontent.com/DawnbrandBots/yaml-yugi-limit-regulation/"
    "master/data/ocg-ae/cardData.json"
)
CATALOG = Path(__file__).resolve().parent.parent / "public" / "catalog.json"
OUT = Path(__file__).resolve().parent.parent / "public" / "banlist.json"


def parse(text: str) -> dict:
    name = ""
    limits: dict[str, int] = {}
    for line in text.splitlines():
        if line.startswith("!"):
            name = line[1:].strip()
            continue
        match = re.match(r"^(\d+)\s+([012])\b", line)
        if match:
            limits[match.group(1)] = int(match.group(2))
    return {"name": name, "limits": limits}


def norm(name: str) -> str:
    text = unicodedata.normalize("NFKC", name).casefold()
    return re.sub(r"[^a-z0-9]+", "", text)


def fetch_tcg(catalog: dict) -> dict:
    """Parse the official page: rows of type, name, Advanced status, Traditional status."""
    import html

    request = urllib.request.Request(TCG_URL, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read().decode("utf-8", errors="ignore")
    lines = [
        line.strip()
        for line in html.unescape(re.sub(r"<[^>]+>", "\n", raw)).splitlines()
        if line.strip()
    ]
    levels = {"Forbidden": 0, "Limited": 1, "Semi-limited": 2, "Semi-Limited": 2, "Unlimited": 3}
    by_name: dict[str, list[str]] = {}
    for card_id, name in catalog.items():
        by_name.setdefault(norm(name), []).append(card_id)
    limits: dict[str, int] = {}
    missing = []
    for i in range(lines.index("Remarks") + 1, len(lines) - 2):
        card_type, name, status = lines[i], lines[i + 1], lines[i + 2]
        if status not in levels or not re.match(r"^(Monster|Spell|Trap)", card_type):
            continue
        ids = by_name.get(norm(re.sub(r"\s+", " ", name)))
        if not ids:
            missing.append(name)
            continue
        if levels[status] < 3:
            for card_id in ids:
                limits[card_id] = levels[status]
    if missing:
        print("TCG names not in the catalog:", ", ".join(missing))
    return {"name": TCG_NAME, "limits": limits}


def fetch_ae() -> dict:
    """AE entries carry English names only, so match them to catalog passcodes by name."""
    with urllib.request.urlopen(AE_URL, timeout=60) as response:
        data = json.loads(response.read().decode("utf-8"))
    latest = data["en"]["effective_dates"][-1]
    wanted = {"Forbidden (AE)": 0, "Limited (AE)": 1, "Semi-Limited (AE)": 2}
    by_name: dict[str, list[str]] = {}
    for card_id, name in json.loads(CATALOG.read_text(encoding="utf-8")).items():
        by_name.setdefault(norm(name), []).append(card_id)
    limits: dict[str, int] = {}
    missing = []
    for lst in latest["card_lists"]:
        if lst["card_list_name"] not in wanted:
            continue
        for card in lst["cards"]:
            ids = by_name.get(norm(card["card_name"]))
            if not ids:
                missing.append(card["card_name"])
                continue
            for card_id in ids:
                limits[card_id] = wanted[lst["card_list_name"]]
    if missing:
        print("AE names not in the catalog:", ", ".join(missing))
    return {"name": f"{latest['effective_date_name']} AE", "limits": limits}


def expand_by_name(limits: dict, catalog: dict) -> dict:
    """Alternate-art passcodes share a name with the listed one; they share its limit."""
    by_name: dict[str, list[str]] = {}
    for card_id, name in catalog.items():
        by_name.setdefault(norm(name), []).append(card_id)
    out = dict(limits)
    for card_id, limit in limits.items():
        name = catalog.get(card_id)
        if name is None:
            continue
        for sibling in by_name.get(norm(name), []):
            out.setdefault(sibling, limit)
    return out


def main() -> None:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    result = {}
    for key, filename in LISTS.items():
        with urllib.request.urlopen(BASE + filename, timeout=30) as response:
            result[key] = parse(response.read().decode("utf-8"))
        print(key, result[key]["name"], len(result[key]["limits"]), "cards")
    result["tcg"] = fetch_tcg(catalog)
    print("tcg", result["tcg"]["name"], len(result["tcg"]["limits"]), "passcodes")
    result["ae"] = fetch_ae()
    print("ae", result["ae"]["name"], len(result["ae"]["limits"]), "passcodes")
    for key in result:
        result[key]["limits"] = expand_by_name(result[key]["limits"], catalog)
    OUT.write_text(json.dumps(result, separators=(",", ":")), encoding="utf-8")


if __name__ == "__main__":
    main()
