#!/usr/bin/env python3
"""Download small card images into public/cards/<passcode>.jpg.

Images come from YGOPRODeck's image host, which asks API users to download
each image once and serve it locally instead of hotlinking, and rate-limits
heavy request volume. This script therefore:

  * fetches only ids you name, never the whole catalog;
  * skips files that already exist;
  * throttles to ~4 requests per second (their limit is 20/s);
  * stops on HTTP 429/403 instead of retrying.

public/cards/ is gitignored: card art is not redistributed from this repo.
The app shows a placeholder for any card without a local image.

Usage:
  fetch-card-images.py [--demo] [--all] [FILE ...] [ID ...]

--all fetches every card in the catalog (about 15,000 images, roughly 450 MB,
about an hour at the throttled rate). It is resumable: stop it and run it again
and existing files are skipped.

FILE may be a .ydk, a MAPPING .json, or any text file; every number that is a
known catalog id is fetched. A bare number is fetched as that card id.
--demo adds the bundled demo decks.

When the host has no image for an id, the script looks the id up in the pinned
MyCard cards.cdb (`.cache/mycard-cards.cdb`, written by extract-catalog.py).
Its `datas.alias` column maps an alternate-art id to the original passcode;
the original's image is then saved under the alternate id.
"""

from __future__ import annotations

import json
import re
import sqlite3
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "public" / "catalog.json"
OUT_DIR = ROOT / "public" / "cards"
CDB = ROOT / ".cache" / "mycard-cards.cdb"
DEMOS = [
    ROOT / "src" / "data" / "powerPatronArsMagnaDemo.ts",
    ROOT / "src" / "data" / "elfnoteArsMagnaDemo.ts",
]
URL = "https://images.ygoprodeck.com/images/cards_small/{id}.jpg"
DELAY_SECONDS = 0.25
MAX_BYTES = 500_000


def load_aliases() -> dict[str, str]:
    """Alternate-art id -> original passcode, from the pinned MyCard cards.cdb.

    MyCard names some cards under an alternate-art id the image host does not
    know; its `datas.alias` column points at the original passcode.
    """
    if not CDB.is_file():
        return {}
    connection = sqlite3.connect(f"file:{CDB}?mode=ro&immutable=1", uri=True)
    rows = connection.execute("SELECT id, alias FROM datas WHERE alias != 0").fetchall()
    return {str(card_id): str(alias) for card_id, alias in rows}


def collect_ids(paths: list[Path], known: set[str]) -> list[str]:
    found: dict[str, None] = {}
    for path in paths:
        if not path.is_file():
            raise SystemExit(f"error: file not found: {path}")
        text = path.read_text(encoding="utf-8", errors="ignore")
        for match in re.findall(r"\b\d{5,10}\b", text):
            if match in known:
                found.setdefault(match)
    return list(found)


def download(image_id: str) -> tuple[bytes | None, str]:
    """Fetch one image from the host; returns (bytes, "") or (None, reason)."""
    request = urllib.request.Request(
        URL.format(id=image_id), headers={"User-Agent": "mapping-local-fetch"}
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.headers.get_content_type() != "image/jpeg":
                return None, "skipped (not a jpeg)"
            data = response.read(MAX_BYTES + 1)
    except urllib.error.HTTPError as error:
        if error.code in (403, 429):
            raise SystemExit(f"error: HTTP {error.code}; stop and retry later")
        return None, f"missing (HTTP {error.code})"
    if len(data) > MAX_BYTES:
        return None, "skipped (too large)"
    return data, ""


def fetch(card_id: str, aliases: dict[str, str]) -> str:
    dest = OUT_DIR / f"{card_id}.jpg"
    if dest.is_file():
        return "cached"
    data, reason = download(card_id)
    via_alias = False
    if data is None and reason.startswith("missing") and card_id in aliases:
        time.sleep(DELAY_SECONDS)
        data, reason = download(aliases[card_id])
        via_alias = data is not None
    if data is None:
        return reason
    tmp = dest.with_suffix(".part")
    tmp.write_bytes(data)
    tmp.replace(dest)
    return "downloaded via alias" if via_alias else "downloaded"


def main(argv: list[str]) -> int:
    args = argv[1:]
    everything = "--all" in args
    explicit = [arg for arg in args if arg.isdigit()]
    paths = [
        Path(arg)
        for arg in args
        if arg not in ("--demo", "--all") and not arg.isdigit()
    ]
    if "--demo" in args:
        paths.extend(DEMOS)
    if not paths and not explicit and not everything:
        print(__doc__)
        return 2
    known = set(json.loads(CATALOG.read_text(encoding="utf-8")))
    ids = sorted(known, key=int) if everything else collect_ids(paths, known)
    for card_id in explicit:
        if card_id not in known:
            print(f"warning: {card_id} is not in the catalog, skipping")
        elif card_id not in ids:
            ids.append(card_id)
    aliases = load_aliases()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    counts: dict[str, int] = {}

    def write_manifest() -> int:
        # Lets the app render only images that exist (no 404 noise).
        available = sorted(
            int(p.stem) for p in OUT_DIR.glob("*.jpg") if p.stem.isdigit()
        )
        (OUT_DIR / "index.json").write_text(json.dumps(available), encoding="utf-8")
        return len(available)

    quiet = everything and len(ids) > 200
    try:
        for index, card_id in enumerate(ids, start=1):
            status = fetch(card_id, aliases)
            counts[status] = counts.get(status, 0) + 1
            if status != "cached":
                # Pace every request actually made, hits and misses alike.
                time.sleep(DELAY_SECONDS)
            if not quiet:
                print(f"[{index}/{len(ids)}] {card_id} {status}")
            elif index % 250 == 0:
                print(f"[{index}/{len(ids)}] " + ", ".join(
                    f"{n} {s}" for s, n in sorted(counts.items())
                ), flush=True)
                write_manifest()
    finally:
        # Keep progress if the run is stopped: the next run skips existing files.
        total = write_manifest()
    print(", ".join(f"{n} {s}" for s, n in sorted(counts.items())))
    print(f"wrote manifest with {total} images")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
