#!/usr/bin/env python3
"""Generate public/catalog.json from MyCard en-US cards.cdb.

Names only. Canonical ids are Konami/MyCard passwords. This pin may be
ahead of YAPPING's solver cdb.

Usage:
  extract-catalog.py            regenerate from the pinned, hash-verified commit
  extract-catalog.py --latest   move the pin to the newest upstream commit
                                (rewrites MYCARD_COMMIT/MYCARD_SHA256 below),
                                then regenerate
  extract-catalog.py FILE       regenerate from a local cards.cdb
  --with-ygoprodeck             also add names for cards newer than the MyCard
                                cdb (live API, so not reproducible from the pin)
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "catalog.json"
EXTRA_OUT = ROOT / "public" / "extra-deck.json"
# YGOPro `datas.type` bits for Extra Deck monsters (Pendulum variants carry them too).
EXTRA_TYPE_BITS = 0x40 | 0x2000 | 0x800000 | 0x4000000  # Fusion, Synchro, Xyz, Link
EXTRA_TYPE_WORDS = ("fusion", "synchro", "xyz", "link")
META = ROOT / "public" / "catalog.meta.json"
CACHE = ROOT / ".cache" / "mycard-cards.cdb"

MYCARD_REPO = "mycard/ygopro-database"
MYCARD_COMMIT = "ad0a51f591421840cc549d858f35a861345b541d"
MYCARD_SHA256 = "7f57ae28bb1d0b5987c8159c193c18ff820b1119a513949b1bf3cb5aa36234ef"
MYCARD_URL = (
    f"https://raw.githubusercontent.com/{MYCARD_REPO}/"
    f"{MYCARD_COMMIT}/locales/en-US/cards.cdb"
)

YAPPING_PIN_COMMIT = "8f36c87c2faea4d24a6062410f9dfe0cd6848865"
YAPPING_PIN_SHA256 = "f81958a2e0c238ddf5060482e1a2fc2c0d4a7f75917e76c388cab1a28fa43d4c"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download_pinned_mycard(dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".cdb.download")
    print(f"downloading {MYCARD_URL}")
    urllib.request.urlretrieve(MYCARD_URL, tmp)
    actual = sha256_file(tmp)
    if actual != MYCARD_SHA256:
        tmp.unlink(missing_ok=True)
        raise SystemExit(
            f"error: MyCard cards.cdb checksum mismatch\n"
            f"expected: {MYCARD_SHA256}\n"
            f"actual:   {actual}"
        )
    tmp.replace(dest)


CDB_PATH = "locales/en-US/cards.cdb"
SELF = Path(__file__).resolve()


def mycard_url(commit: str) -> str:
    return f"https://raw.githubusercontent.com/{MYCARD_REPO}/{commit}/{CDB_PATH}"


def latest_mycard_commit() -> str:
    """Newest commit on the default branch that touched the en-US cards.cdb."""
    api = (
        f"https://api.github.com/repos/{MYCARD_REPO}/commits"
        f"?path={CDB_PATH}&per_page=1"
    )
    request = urllib.request.Request(
        api, headers={"Accept": "application/vnd.github+json"}
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        commits = json.load(response)
    if not commits:
        raise SystemExit("error: no commits found for the MyCard en-US cards.cdb")
    return commits[0]["sha"]


def refresh_pin() -> None:
    """Resolve the newest upstream cards.cdb, then rewrite this script's pin."""
    commit = latest_mycard_commit()
    if commit == MYCARD_COMMIT:
        print(f"pin already at latest upstream commit {commit[:7]}")
        return
    dest = CACHE.with_name(f"mycard-cards-{commit[:7]}.cdb")
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(".download")
    print(f"downloading {mycard_url(commit)}")
    urllib.request.urlretrieve(mycard_url(commit), tmp)
    digest = sha256_file(tmp)
    tmp.replace(dest)
    source = SELF.read_text(encoding="utf-8")
    source = re.sub(
        r'^MYCARD_COMMIT = ".*"$', f'MYCARD_COMMIT = "{commit}"', source, flags=re.M
    )
    source = re.sub(
        r'^MYCARD_SHA256 = ".*"$', f'MYCARD_SHA256 = "{digest}"', source, flags=re.M
    )
    SELF.write_text(source, encoding="utf-8")
    CACHE.unlink(missing_ok=True)
    dest.replace(CACHE)
    print(f"pin updated {MYCARD_COMMIT[:7]} -> {commit[:7]} sha256 {digest}")
    print("rerun without --latest to regenerate the catalog with the new pin")


YGOPRODECK_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php"


def is_extra_type_name(type_name: str) -> bool:
    """True for YGOPRODeck type strings such as 'Fusion Pendulum Effect Monster'."""
    words = type_name.lower().split()
    return "monster" in words and any(word in EXTRA_TYPE_WORDS for word in words)


def ygoprodeck_supplement(
    catalog: dict[str, str],
) -> tuple[dict[str, str], dict[str, tuple[str, str]], set[str]]:
    """Newer and official English names from YGOPRODeck.

    Opt-in (--with-ygoprodeck) because it reads a live API, so the result is not
    reproducible from the pin alone. Returns (added, renamed):

    * renamed: ids both sources have, where the names differ. YGOPRODeck carries
      the current official TCG name; MyCard can keep an older translation (for
      example "Ars Magna of Infinity and Finity" vs the official "Ars Magna the
      Finite and the Infinite"), so YGOPRODeck's name wins.
    * added: cards MyCard does not have yet. Only ids AND names absent from the
      catalog are added: MyCard uses alternate-art ids for some cards, and adding
      the original passcode under the same name would show duplicates in search.
    """
    request = urllib.request.Request(
        YGOPRODECK_URL, headers={"User-Agent": "mapping-catalog-update"}
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        cards = json.load(response)["data"]
    renamed: dict[str, tuple[str, str]] = {}
    for card in cards:
        card_id, name = str(card["id"]), card["name"]
        if card_id in catalog and catalog[card_id] != name:
            renamed[card_id] = (catalog[card_id], name)
    names_after = {
        card_id: renamed[card_id][1] if card_id in renamed else name
        for card_id, name in catalog.items()
    }
    known_names = {name.casefold() for name in names_after.values()}
    added: dict[str, str] = {}
    for card in cards:
        card_id, name = str(card["id"]), card["name"]
        if card_id in catalog or name.casefold() in known_names:
            continue
        added[card_id] = name
    extra_ids = {
        str(card["id"]) for card in cards if is_extra_type_name(card.get("type", ""))
    }
    return added, renamed, extra_ids


def resolve_source(argv: list[str]) -> tuple[Path, str]:
    positional = [arg for arg in argv[1:] if not arg.startswith("--")]
    if positional:
        path = Path(positional[0]).resolve()
        if not path.is_file():
            raise SystemExit(f"error: cards.cdb not found at {path}")
        return path, "cli"
    if not CACHE.is_file() or sha256_file(CACHE) != MYCARD_SHA256:
        download_pinned_mycard(CACHE)
    return CACHE.resolve(), "mycard-pin"


def main() -> int:
    if "--latest" in sys.argv[1:]:
        refresh_pin()
        # Constants above are stale after the rewrite: rerun on the new pin.
        rest = [arg for arg in sys.argv[1:] if arg != "--latest"]
        os.execv(sys.executable, [sys.executable, str(SELF), *rest])
    source, origin = resolve_source(sys.argv)
    digest = sha256_file(source)
    connection = sqlite3.connect(source)
    rows = connection.execute("SELECT id, name FROM texts").fetchall()
    catalog = {str(card_id): name for card_id, name in rows}
    mycard_texts = len(catalog)
    # Extra Deck monsters, from the cdb's type bits.
    extra_ids = {
        str(card_id)
        for (card_id,) in connection.execute(
            "SELECT id FROM datas WHERE (type & ?) != 0", (EXTRA_TYPE_BITS,)
        )
    }
    supplement: dict[str, str] = {}
    renamed: dict[str, tuple[str, str]] = {}
    if "--with-ygoprodeck" in sys.argv[1:]:
        supplement, renamed, api_extra = ygoprodeck_supplement(catalog)
        extra_ids |= api_extra
        for card_id, (_old, new) in renamed.items():
            catalog[card_id] = new
        catalog.update(supplement)
        print(f"added {len(supplement)} names missing from MyCard (YGOPRODeck)")
        print(f"renamed {len(renamed)} cards to YGOPRODeck's current names")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(catalog, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    # Only ids the catalog names, so the app can route a card to the Extra Deck.
    extra_list = sorted(int(card_id) for card_id in extra_ids if card_id in catalog)
    EXTRA_OUT.write_text(json.dumps(extra_list, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(extra_list)} Extra Deck monster ids to {EXTRA_OUT}")
    meta = {
        "source": MYCARD_REPO,
        "locale": "en-US",
        "purpose": "names-only",
        "canonical_ids": "mycard-passwords",
        "origin": origin,
        "sha256": digest,
        "texts": mycard_texts,
        "supplement": (
            {
                "source": "db.ygoprodeck.com/api/v7/cardinfo.php",
                "names_added": len(supplement),
                "names_renamed": len(renamed),
                "note": "added: ids and names absent from the MyCard cdb; "
                "renamed: YGOPRODeck's current official name replaces MyCard's; "
                "not reproducible from the pin",
            }
            if supplement
            else None
        ),
        "mapping_pin_commit": MYCARD_COMMIT,
        "mapping_pin_sha256": MYCARD_SHA256,
        "yapping_pin_commit": YAPPING_PIN_COMMIT,
        "yapping_pin_sha256": YAPPING_PIN_SHA256,
        "matches_mapping_pin": digest == MYCARD_SHA256,
        "ahead_of_yapping_pin": digest != YAPPING_PIN_SHA256,
        "extracted_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    META.write_text(f"{json.dumps(meta, indent=2)}\n", encoding="utf-8")
    print(
        f"wrote {len(catalog)} names to {OUT} "
        f"({mycard_texts} MyCard + {len(supplement)} supplement)"
    )
    print(f"sha256 {digest} origin={origin}")
    if meta["ahead_of_yapping_pin"]:
        print(
            "note: name catalog is ahead of YAPPING's solver cdb pin; "
            "exported ids may name cards the engine cannot play yet",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
