#!/usr/bin/env python3
"""Generate public/catalog.json from MyCard en-US cards.cdb.

Names only. Canonical ids are Konami/MyCard passwords. This pin may be
ahead of YAPPING's solver cdb.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "catalog.json"
META = ROOT / "public" / "catalog.meta.json"
CACHE = ROOT / ".cache" / "mycard-cards.cdb"

MYCARD_REPO = "mycard/ygopro-database"
MYCARD_COMMIT = "8c8d2316ea42b7f79c0e2248cd74a2da2575ab9d"
MYCARD_SHA256 = "799f748b2280af459fa917f6b305345ae74814cba83594f592407eb1a3932ecf"
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


def resolve_source(argv: list[str]) -> tuple[Path, str]:
    if len(argv) > 1:
        path = Path(argv[1]).resolve()
        if not path.is_file():
            raise SystemExit(f"error: cards.cdb not found at {path}")
        return path, "cli"
    if not CACHE.is_file() or sha256_file(CACHE) != MYCARD_SHA256:
        download_pinned_mycard(CACHE)
    return CACHE.resolve(), "mycard-pin"


def main() -> int:
    source, origin = resolve_source(sys.argv)
    digest = sha256_file(source)
    connection = sqlite3.connect(source)
    rows = connection.execute("SELECT id, name FROM texts").fetchall()
    catalog = {str(card_id): name for card_id, name in rows}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(catalog, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    meta = {
        "source": MYCARD_REPO,
        "locale": "en-US",
        "purpose": "names-only",
        "canonical_ids": "mycard-passwords",
        "origin": origin,
        "sha256": digest,
        "texts": len(catalog),
        "mapping_pin_commit": MYCARD_COMMIT,
        "mapping_pin_sha256": MYCARD_SHA256,
        "yapping_pin_commit": YAPPING_PIN_COMMIT,
        "yapping_pin_sha256": YAPPING_PIN_SHA256,
        "matches_mapping_pin": digest == MYCARD_SHA256,
        "ahead_of_yapping_pin": digest != YAPPING_PIN_SHA256,
        "extracted_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    META.write_text(f"{json.dumps(meta, indent=2)}\n", encoding="utf-8")
    print(f"wrote {len(catalog)} MyCard names to {OUT}")
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
