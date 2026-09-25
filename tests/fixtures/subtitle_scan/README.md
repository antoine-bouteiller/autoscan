# Timing-only calibration fixture

`real_intervals.txt` stores only SRT cue start/end times in milliseconds and probed movie duration. No subtitle dialogue or movie audio is included. The local source SRTs were previously downloaded for investigation; they are not test dependencies. They were under `/tmp/more-subtitle-checks.dkDvPe/{hateful-eight,good-bad-ugly}/` and `/tmp/interstellar-subtitles.QxUhpT/`. Source SHA-256s, in `en, fr` order:

- Hateful Eight: `291afdc0816e36797f895bdbc87eea1df0551cbbbc33e697126aa399c93691fc`, `d364c9d6b90e6c7875e3689148c1b85a75d420a73374e6faafea459ce6abe8eb` (duration 10084.928 s).
- The Good, the Bad and the Ugly: `2ac4b6b0476d48058a6c461f423b30fe218e51e503c80e004424ef7f67b59fca`, `c45d88aee680f48d62206a6c85be5d59e35e6c243bb9224eb54c2858755ca93b` (10723.066 s).
- Interstellar: `c67dd2685f5856a030677d7b5ad67325ef853636355cc2c4a9ec7e04dcf4a294`, `31659ea2ec33a8dee536a0cfa660e8e02679a1eaa351cf98b960185629b5be55` (10143.968 s).

To regenerate from copies of those six SRTs (in the indicated language order), run:

```sh
python3 tests/fixtures/subtitle_scan/extract_intervals.py hateful_eight 10084.928 "$HATEFUL_EN" "$HATEFUL_FR" western 10723.066 "$WESTERN_EN" "$WESTERN_FR" interstellar 10143.968 "$INTERSTELLAR_EN" "$INTERSTELLAR_FR" > tests/fixtures/subtitle_scan/real_intervals.txt
bun test tests/features/subtitle_scan/services/subtitle_coverage_calibration.spec.ts
```

The test is a **non-production policy experiment**. Passing its finite controls does not approve its thresholds or prove which subtitle matches the movie's audio. A data-derived endpoint lag check now rejects exact-copy global shifts, including −84 minutes. It still falsely invalidates a real English Interstellar track shifted −100 minutes against its French sibling; T-001 remains open until that translated-track counterexample abstains.
