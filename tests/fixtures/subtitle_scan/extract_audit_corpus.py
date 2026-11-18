"""Build the timing-only audit corpus. See README.md for the format and provenance.

Usage: python3 -I extract_audit_corpus.py <data-dir> <whisper-dir> <labels.tsv> > audit_corpus.txt
<data-dir> holds media.tsv, subs.tsv and subs/<id>.<lang>.srt as fetched from the host.
"""
import hashlib, json, re, sys
from pathlib import Path

WINDOWS = ["0.06", "0.18", "0.30", "0.42", "0.54", "0.66", "0.78", "0.90"]
WINDOW_SECONDS = 40
AUDIT_CUTOFF = 1794747600  # 2026-11-15T13:00Z: later mtimes are files replaced after the audit
SPEECH_MERGE_GAP = 0.3
TIME = re.compile(r"(\d+):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d+):(\d{2}):(\d{2})[,.](\d{3})")
MARKUP = re.compile(r"<[^>]*>|\{[^}]*\}|[♪♫]")
TOKEN = re.compile(r"[^\W_][\w'’-]*")
SENTENCE_END = re.compile(r"[.!?…:]['\"»”)]*\s*$")

data, whisper, labels_path = (Path(arg) for arg in sys.argv[1:4])


def read_text(path):
    raw = path.read_bytes()
    try:
        return raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        return raw.decode("cp1252")


def anchors(lines):
    found = []
    initial = True
    for line in lines:
        line = MARKUP.sub("", line).strip()
        if line.startswith("-"):
            line, initial = line.lstrip("- "), True
        for match in TOKEN.finditer(line):
            prefix = line[: match.start()]
            word = re.sub(r"['’]s$", "", match.group())
            sentence_initial = initial and not TOKEN.search(prefix) or SENTENCE_END.search(prefix) is not None
            if word.isdigit() or (word[0].isupper() and not sentence_initial and len(word) > 1 and not re.match(r"I['’]", word)):
                found.append(hashlib.sha1(word.lower().encode()).hexdigest()[:8])
        initial = SENTENCE_END.search(line) is not None
    return found


def cues(path):
    result = []
    for block in re.split(r"\r?\n\s*\r?\n", read_text(path).replace("\r\n", "\n")):
        lines = block.strip().split("\n")
        for index, line in enumerate(lines):
            match = TIME.search(line)
            if match:
                g = [int(x) for x in match.groups()]
                start = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / 1000
                end = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / 1000
                if end > start:
                    result.append((start, end, anchors(lines[index + 1 :])))
                break
    return sorted(result)


def speech(clip, start):
    words = []
    for segment in json.loads((whisper / f"{clip}.json").read_text())["segments"]:
        if segment["compression_ratio"] > 2.4 or (segment["no_speech_prob"] > 0.6 and segment["avg_logprob"] < -1):
            continue
        words += [(max(0.0, s), min(float(WINDOW_SECONDS), e)) for s, e, p in segment["words"] if p >= 0.2 and e > s]
    merged = []
    for s, e in sorted(words):
        if merged and s - merged[-1][1] <= SPEECH_MERGE_GAP:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return ",".join(f"{start + s:.3f}-{start + e:.3f}" for s, e in merged if e > s)


labels = {}
for line in labels_path.read_text().splitlines():
    if line and not line.startswith("#"):
        match, lang, label, source, measured = line.split("\t")
        labels[(match, lang)] = (label, measured, "audited" if source == "report" else "checked")

subs = {}
for line in (data / "subs.tsv").read_text().splitlines():
    media_id, lang, stat, sha = line.split("\t")
    subs[(media_id, lang)] = (int(stat.split()[1]), sha)

out = []
used = set()
for line in (data / "media.tsv").read_text().splitlines():
    media_id, duration, _streams, base = line.split("\t")
    name = Path(base).name
    out.append(f"M\t{media_id}\t{float(duration):.3f}\t{name}")
    for fraction in WINDOWS:
        start = float(f"{float(duration) * float(fraction):.3f}")
        out.append(f"W\t{media_id}\t{start:.3f}\t{WINDOW_SECONDS}\t{speech(f'{media_id}-{fraction}', start)}")
    for lang in ("en", "fr"):
        key = next((k for k in labels if k[1] == lang and name.startswith(k[0])), None)
        label, measured, audited = labels.get(key, ("unaudited", "", "unaudited"))
        if key:
            used.add(key)
        if (media_id, lang) not in subs:
            if key:
                out.append(f"L\t{media_id}\t{lang}\t{label}\t{measured}")
            continue
        mtime, sha = subs[(media_id, lang)]
        if mtime >= AUDIT_CUTOFF:
            if key:
                out.append(f"L\t{media_id}\t{lang}\t{label}\t{measured}")
            label, measured, status = "unaudited", "", "replaced"
        else:
            status = audited
        out.append(f"T\t{media_id}\t{lang}\t{status}\t{label}\t{sha}\t{measured}")
        rows = [f"{s:.3f}-{e:.3f}" + (":" + "|".join(a) if a else "") for s, e, a in cues(data / "subs" / f"{media_id}.{lang}.srt")]
        out.append(f"C\t{media_id}\t{lang}\t{','.join(rows)}")

missing = set(labels) - used
if missing:
    sys.exit(f"labels without media: {sorted(missing)}")
print("\n".join(out))
