"""Merge data/words.json + data/fixes.json + data/extras/*.txt into docs/words.js.

Usage: python3 scripts/build.py [--report]
"""
import json
import re
import sys
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Leaves within a domain whose PDF definitions overlap too much to be fair
# wrong answers for each other. Leaves not listed form their own cluster.
# Same cluster => never a distractor. Same domain, other cluster => "trap".
CLUSTERS = {
    "amount": ["abundant/excess"],
    "care": ["careful/fussy/strict/cautious", "careless/indifferent"],
    "calm": ["soothe/relieve", "calm/unemotional"],
    "change": ["fickle/waver", "stubborn/persistent"],
    "clear": ["obscure/complex/vague", "clear/explain"],
    "conflict": ["argue/controversial/divide/strife"],
    "deceive": ["deceive/pretend/betray", "genuine/honest"],
    "difficulty": ["hard/burden"],
    "doubt": ["doubtful/torn/tentative"],
    "dull": ["boring/cliche/bored"],
    "energy": ["lazy/slow/sleepy/tired", "eager/lively/invigorate"],
    "generous": ["stingy/frugal", "wasteful/indulge"],
    "harm": ["improve/healthy", "harmful/disaster"],
    "hostile": ["hatred/malicious/harsh"],
    "judge": ["criticize/rant", "praise/worship"],
    "mood": ["happy/optimistic"],
    "naive": ["naive/immature/novice/ignorant"],
    "obstruct": ["hinder/restrain"],
    "odd": ["strange/rebel/outofplace"],
    "reject": ["renounce/reject/deny"],
    "reveal": ["secret/hide", "reveal/discover/informed"],
    "rude": ["rude/improper"],
    "same": ["similar/imitate"],
    "show": ["showy/dramatic"],
    "skill": ["skilled/expert/effective", "perceptive/wise"],
    "submit": ["flatter/obedient/follower/beg"],
    "support": ["support/defender/emphasize"],
    "talk": ["quiet/concise"],
    "like": ["love/tendency"],
    "importance": ["trivial/belittle/shallow"],
    "replace": ["replace/surpass"],
    "brave": ["brave/reckless/confident"],
    "persuade": ["force/urge"],
    "mind": ["narrow/prejudiced"],
    "join": ["separate/isolate"],
}

STOP = set("""a an the of or and to in on for with by as at from be is are being one's
someone something someone's person thing things that which who its it this often
especially usually typically very extremely highly overly excessively great greatly
make making cause causing show showing having state quality way manner""".split())
NEG = {"not", "no", "without", "lacking", "un", "never", "free"}


def cluster_of(tag):
    domain, leaf = tag.split(".")
    for i, group in enumerate(CLUSTERS.get(domain, [])):
        if leaf in group.split("/"):
            return f"{domain}#{i}"
    return tag


def stem(tok):
    for suf in ("ness", "ing", "edly", "ed", "ly", "es", "s"):
        if tok.endswith(suf) and len(tok) - len(suf) >= 4:
            return tok[: -len(suf)]
    return tok


def content_tokens(senses):
    """Stemmed content words; a word right after a negator becomes '!word'."""
    out = set()
    for s in senses:
        s = re.sub(r"\([^)]*\)", " ", s.lower())
        neg = False
        for tok in re.findall(r"[a-z']+", s):
            if tok in NEG:
                neg = True
                continue
            if tok in STOP or len(tok) < 3:
                continue
            out.add(("!" if neg else "") + stem(tok))
            neg = False
    return out


def looks_alike(a, b):
    if a[:4] == b[:4] or (len(a) > 5 and a[-5:] == b[-5:] and abs(len(a) - len(b)) <= 2):
        return True
    return SequenceMatcher(None, a, b).ratio() >= 0.75


def add_traps(words):
    """Rank candidate wrong answers for each word; store the best ids as 'traps'."""
    toks = [content_tokens(w["senses"]) for w in words]
    df = Counter(t for ts in toks for t in ts)
    for w, wt in zip(words, toks):
        clusters = {cluster_of(t) for t in w["tags"]}
        domains = {t.split(".")[0] for t in w["tags"]}
        scored = []
        for o, ot in zip(words, toks):
            if o is w or o["word"] == w["word"]:
                continue
            if clusters & {cluster_of(t) for t in o["tags"]}:
                continue  # synonym: would make two options correct
            if any(df[t] <= 12 for t in wt & ot):
                continue  # definitions share a distinctive word; too ambiguous
            score = 0
            if domains & {t.split(".")[0] for t in o["tags"]}:
                score += 5
            if looks_alike(w["word"], o["word"]):
                score += 4
            if o["group"] == w["group"]:
                score += 1
            if score:
                scored.append((-score, o["id"]))
        scored.sort()
        w["traps"] = [i for _, i in scored[:14]]
        w["syn"] = [o["id"] for o in words if o is not w and clusters & {cluster_of(t) for t in o["tags"]}]


def load_extras():
    extras = {}
    for path in sorted((ROOT / "data" / "extras").glob("*.txt")):
        for n, line in enumerate(path.read_text().splitlines(), 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) != 4:
                sys.exit(f"{path.name}:{n}: expected 4 fields, got {len(parts)}")
            word, tags, example, hook = parts
            tags = [t.strip() for t in tags.split(",") if t.strip()]
            for t in tags:
                if t.count(".") != 1:
                    sys.exit(f"{path.name}:{n}: bad tag {t!r}")
            extras[word] = {"tags": tags, "example": example, "hook": hook}
    return extras


def main():
    words = json.loads((ROOT / "data" / "words.json").read_text())
    fixes = json.loads((ROOT / "data" / "fixes.json").read_text())
    extras = load_extras()

    out, seen, missing = [], set(), []
    for w in words:
        if w["word"] in seen:  # the PDF lists "cumbersome" twice; keep the first
            continue
        seen.add(w["word"])
        senses = fixes.get(w["word"], w["senses"])
        e = extras.get(w["word"])
        if not e:
            missing.append(w["word"])
            continue
        out.append({"id": len(out), "word": w["word"], "group": w["group"], "senses": senses, **e})

    unused = sorted(set(extras) - seen)
    if missing or unused:
        sys.exit(f"missing extras: {missing}\nextras for unknown words: {unused}")

    add_traps(out)
    js = "// Generated by scripts/build.py. Do not edit by hand.\nwindow.GRE_WORDS = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "docs" / "words.js").write_text(js)
    print(f"Wrote {len(out)} words to docs/words.js")

    if "--report" in sys.argv:
        tags = Counter(t for w in out for t in w["tags"])
        domains = Counter(t.split(".")[0] for w in out for t in w["tags"])
        print(f"{len(tags)} tags, {len(domains)} domains")
        for d, c in sorted(domains.items()):
            leaves = sorted((t, n) for t, n in tags.items() if t.startswith(d + "."))
            print(f"  {d} ({c}): " + ", ".join(f"{t.split('.')[1]}={n}" for t, n in leaves))


if __name__ == "__main__":
    main()
