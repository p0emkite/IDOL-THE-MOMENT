#!/usr/bin/env python3
"""Synchronize the public, admin-reviewed ITM BGM catalogue to GitHub Pages."""
import json
import pathlib
import re
import urllib.parse
import urllib.request

SUPABASE = "https://isyrthdznnbxjyoliwgf.supabase.co"
PUBLISHABLE = "sb_publishable_m6aGlukQ7WJfX9Nq7LwATg_0ifgb3ob"
DEST = pathlib.Path("assets/audio/extra")
API = SUPABASE + "/rest/v1/itm_bgm_tracks?select=id,title,file_path,sort_order&order=sort_order.asc,created_at.asc"
request = urllib.request.Request(API, headers={"apikey": PUBLISHABLE, "Accept": "application/json"})
with urllib.request.urlopen(request, timeout=45) as response:
    rows = json.load(response)
if not isinstance(rows, list):
    raise RuntimeError("Unexpected BGM response")
DEST.mkdir(parents=True, exist_ok=True)
manifest = []
allowed = set()
for row in rows:
    song_id = str(row.get("id", ""))
    path = str(row.get("file_path", ""))
    if not re.fullmatch(r"[0-9a-f-]{36}", song_id) or not re.fullmatch(r"tracks/[0-9a-f-]{36}\.mp3", path):
        raise RuntimeError("Invalid BGM storage path")
    target = DEST / (song_id + ".mp3")
    allowed.add(target.name)
    if not target.exists():
        url = SUPABASE + "/storage/v1/object/public/itm-bgm/" + urllib.parse.quote(path)
        with urllib.request.urlopen(url, timeout=90) as incoming, open(target, "wb") as output:
            total = 0
            while True:
                chunk = incoming.read(1024 * 128)
                if not chunk:
                    break
                total += len(chunk)
                if total > 15 * 1024 * 1024:
                    target.unlink(missing_ok=True)
                    raise RuntimeError("BGM file exceeds 15MB")
                output.write(chunk)
    manifest.append({"id": song_id, "title": str(row.get("title", "")),
                     "url": "./assets/audio/extra/" + target.name})
for old in DEST.glob("*.mp3"):
    if old.name not in allowed:
        old.unlink()
(DEST / "manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)
print("Synchronized", len(manifest), "BGM tracks")
