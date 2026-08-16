#!/usr/bin/env python3
"""Generate public/catalog.json from the sibling YAPPING cards.cdb."""

from __future__ import annotations

import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CDB = ROOT.parent / "yapping" / "assets" / "cards.cdb"
OUT = ROOT / "public" / "catalog.json"


def main() -> int:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CDB
    if not source.is_file():
        print(f"error: cards.cdb not found at {source}", file=sys.stderr)
        return 1
    connection = sqlite3.connect(source)
    rows = connection.execute("SELECT id, name FROM texts").fetchall()
    catalog = {str(card_id): name for card_id, name in rows}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(catalog, separators=(",", ":"), ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"wrote {len(catalog)} names to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
