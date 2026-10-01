"""Parse the GregMat vocab PDF into data/words.json.

Usage: python3 scripts/parse_pdf.py path/to/GregMat_Vocab.pdf
Requires `pdftotext` (poppler-utils).
"""
import json
import re
import subprocess
import sys
from pathlib import Path

ROW = re.compile(r"^\s*(\S.*?)\s{2,}(\S.*)$")
CONT = re.compile(r"^\s{8,}(\S.*)$")
GROUP = re.compile(r"^\s*Group\s+(\d+)\s*$")
SENSE_SPLIT = re.compile(r"\s+(?=\d\.\s)")


def split_senses(lines):
    senses = []
    for line in lines:
        for part in SENSE_SPLIT.split(line):
            part = re.sub(r"^\d\.\s*", "", part).strip()
            if part:
                senses.append(part)
    return senses


def parse(text):
    words, group, current = [], None, None
    for raw in text.replace("\f", "\n").splitlines():
        if not raw.strip():
            continue
        if m := GROUP.match(raw):
            group = int(m.group(1))
            current = None
            continue
        if (m := CONT.match(raw)) and current and not ROW.match(raw.strip() and raw):
            current["_lines"].append(m.group(1).strip())
            continue
        if m := ROW.match(raw):
            current = {"word": m.group(1).strip(), "group": group, "_lines": [m.group(2).strip()]}
            words.append(current)
            continue
        if current:  # wrapped continuation that wasn't indented as expected
            current["_lines"].append(raw.strip())
    for w in words:
        lines = w.pop("_lines")
        # A continuation without a sense number is a wrapped line unless the
        # first line was numbered or the source lists unnumbered senses.
        numbered = bool(re.match(r"^\d\.", lines[0]))
        if not numbered and len(lines) > 1 and not any(re.match(r"^\d\.", l) for l in lines):
            # e.g. "advocate": verb sense then noun sense on separate lines
            w["senses"] = lines
        else:
            merged = []
            for l in lines:
                if merged and not re.match(r"^\d\.", l):
                    merged[-1] += " " + l
                else:
                    merged.append(l)
            w["senses"] = split_senses(merged)
    return words


def main():
    pdf = sys.argv[1]
    text = subprocess.run(["pdftotext", "-layout", pdf, "-"], capture_output=True, text=True, check=True).stdout
    words = parse(text)
    out = Path(__file__).resolve().parent.parent / "data" / "words.json"
    out.write_text(json.dumps(words, indent=1, ensure_ascii=False) + "\n")
    print(f"Wrote {len(words)} words in {len({w['group'] for w in words})} groups to {out}")


if __name__ == "__main__":
    main()
