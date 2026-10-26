#!/usr/bin/env python3
"""
features_to_json.py — erzeugt features.json aus FEATURES.md.

Zweck: FEATURES.md ist die menschen- und agentenlesbare Quelle. Wenn ein
PROGRAMM den Stand auswerten soll (PMSuite-Dashboard, CI-Gate, Statusanzeige),
generiert dieses Skript daraus maschinenlesbares JSON. Der Agent schreibt NIE
direkt JSON — nur Markdown. So kann die maschinenlesbare Datei nicht durch
einen Modell-Tippfehler unlesbar werden.

Nutzung:
    python3 features_to_json.py                 # FEATURES.md -> features.json
    python3 features_to_json.py --check         # nur prüfen, nichts schreiben
    python3 features_to_json.py IN.md OUT.json  # explizite Pfade

Exit-Code 0 = ok, 1 = mindestens eine Zeile nicht parsebar (Report auf stderr).
Reine Standardbibliothek, keine Abhängigkeiten.
"""
import sys
import re
import json
import datetime

# Zeilen-Grammatik:  - `F-001` Titel — **status**[ · Grund]
LINE = re.compile(
    r"^- +`(?P<id>F-\d+)` +(?P<title>.+?) +— +\*\*(?P<status>[a-zä-]+)\*\*"
    r"(?: *· *(?P<note>.+?))? *$"
)
HEADING = re.compile(r"^#{2,3} +(?P<name>.+?) *$")
VALID = {"offen", "in-arbeit", "fertig", "blockiert", "verworfen"}


def parse(path):
    features, problems, seen = [], [], {}
    section = None
    in_comment = False
    for n, raw in enumerate(open(path, encoding="utf-8"), 1):
        line = raw.rstrip("\n")
        # HTML-Kommentarblöcke überspringen (Grammatik-Beispiele darin ignorieren)
        if "<!--" in line:
            in_comment = True
        if in_comment:
            if "-->" in line:
                in_comment = False
            continue
        h = HEADING.match(line)
        if h:
            name = h.group("name")
            # Legende/Meta-Überschriften nicht als Modul werten
            if name.lower() not in ("status-legende",):
                section = name
            continue
        if not line.startswith("- `F-"):
            continue
        m = LINE.match(line)
        if not m:
            problems.append((n, "Zeile passt nicht zur Grammatik", line))
            continue
        fid, title = m.group("id"), m.group("title").strip()
        status, note = m.group("status"), m.group("note")
        if status not in VALID:
            problems.append((n, f"unbekannter Status '{status}'", line))
            continue
        if status == "blockiert" and not note:
            problems.append((n, "blockiert ohne Grund", line))
        if fid in seen:
            problems.append((n, f"doppelte ID {fid} (zuerst Zeile {seen[fid]})", line))
            continue
        seen[fid] = n
        features.append({
            "id": fid,
            "title": title,
            "status": status,
            "note": note,
            "section": section,
        })
    return features, problems


def main():
    args = [a for a in sys.argv[1:] if a not in ("--check", "-c")]
    check = "--check" in sys.argv[1:] or "-c" in sys.argv[1:]
    src = args[0] if len(args) >= 1 else "FEATURES.md"
    dst = args[1] if len(args) >= 2 else "features.json"

    try:
        features, problems = parse(src)
    except FileNotFoundError:
        print(f"✗ {src} nicht gefunden.", file=sys.stderr)
        return 1

    counts = {}
    for f in features:
        counts[f["status"]] = counts.get(f["status"], 0) + 1

    for n, why, line in problems:
        print(f"! Zeile {n}: {why}\n    {line}", file=sys.stderr)

    doc = {
        "project": None,
        "generated_at": datetime.datetime.now().isoformat(timespec="seconds"),
        "source": src,
        "total": len(features),
        "counts": counts,
        "features": features,
    }

    if check:
        print(f"{len(features)} Feature(s): " +
              ", ".join(f"{k}={v}" for k, v in sorted(counts.items())))
        if problems:
            print(f"{len(problems)} Problem(e) — siehe oben.", file=sys.stderr)
            return 1
        print("Alles parsebar.")
        return 0

    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print(f"✓ {dst} geschrieben — {len(features)} Feature(s).")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
