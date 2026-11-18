# Timing-only calibration fixture

`real_intervals.txt` stores only SRT cue start/end times in milliseconds and probed movie duration. No subtitle dialogue or movie audio is included. The local source SRTs were previously downloaded for investigation; they are not test dependencies. They were under `/tmp/more-subtitle-checks.dkDvPe/{hateful-eight,good-bad-ugly}/` and `/tmp/interstellar-subtitles.QxUhpT/`. Source SHA-256s, in `en, fr` order:

- Hateful Eight: `291afdc0816e36797f895bdbc87eea1df0551cbbbc33e697126aa399c93691fc`, `d364c9d6b90e6c7875e3689148c1b85a75d420a73374e6faafea459ce6abe8eb` (duration 10084.928 s).
- The Good, the Bad and the Ugly: `2ac4b6b0476d48058a6c461f423b30fe218e51e503c80e004424ef7f67b59fca`, `c45d88aee680f48d62206a6c85be5d59e35e6c243bb9224eb54c2858755ca93b` (10723.066 s).
- Interstellar: `c67dd2685f5856a030677d7b5ad67325ef853636355cc2c4a9ec7e04dcf4a294`, `31659ea2ec33a8dee536a0cfa660e8e02679a1eaa351cf98b960185629b5be55` (10143.968 s).

To regenerate from copies of those six SRTs (in the indicated language order), run:

```sh
python3 tests/fixtures/subtitle_scan/extract_intervals.py hateful_eight 10084.928 "$HATEFUL_EN" "$HATEFUL_FR" western 10723.066 "$WESTERN_EN" "$WESTERN_FR" interstellar 10143.968 "$INTERSTELLAR_EN" "$INTERSTELLAR_FR" > tests/fixtures/subtitle_scan/real_intervals.txt
```

# Audit corpus

`audit_corpus.txt` replays the 2026-11-15 invalid-subtitle audit (`invalid_subtitles_report.md`) without dialogue or audio. It covers the 44 audited media plus Desperate Housewives S01E04. Each line is tab-separated and starts with a record type:

- `M id duration name`: a media file and its probed duration in seconds.
- `W id start seconds speech`: one of the 8 sampled 40 s windows at 6 %, 18 %, …, 90 % of the runtime. `speech` lists `start-end` intervals in media seconds. They are Whisper large-v3-turbo word timestamps, with words merged across gaps of 0.3 s or less. Words with probability under 0.2 and segments that look like hallucinations are dropped.
- `T id lang status label sha256 measured`: a sidecar on disk. `status` is `audited` when the report labels this exact file, `checked` when it was labelled after the report, `replaced` when the file changed after the audit (its label no longer applies), and `unaudited` otherwise.
- `C id lang cues`: the sidecar's cues as `start-end[:anchor|anchor…]` in seconds. An anchor is the first 8 hex characters of the SHA-1 of a lowercased number or mid-sentence capitalised word.
- `L id lang label measured`: a report label whose file was deleted or replaced after the audit. No cues are kept for it.

Labels come from `audit_labels.tsv`. Rows with source `report` copy the report. Rows with source `check` were measured on 2026-11-17 from this corpus's speech intervals.

The 47 broken tracks the report lists were deleted through Bazarr on 2026-11-15, and the 4 constant-offset tracks were rewritten. Only the 33 false positives keep their audited files. A builder for `[VC-9]` must derive the broken side from these real cues.

To regenerate, fetch from the host into an empty data directory, for every media base path: `media.tsv` (`id`, duration, audio stream dispositions, base path), `subs.tsv` (`id`, language, `size mtime`, SHA-256), `subs/<id>.<lang>.srt`, and `clips/<id>-<fraction>.flac`, decoded with `ffmpeg -ss <duration × fraction> -t 40 -i <media> -map 0:a:0 -ac 1 -ar 16000`. Then run:

```sh
python3 -I tests/fixtures/subtitle_scan/transcribe_audit_clips.py "$DATA/clips" "$DATA/whisper"   # needs mlx-whisper
python3 -I tests/fixtures/subtitle_scan/extract_audit_corpus.py "$DATA" "$DATA/whisper" tests/fixtures/subtitle_scan/audit_labels.tsv > tests/fixtures/subtitle_scan/audit_corpus.txt
```
