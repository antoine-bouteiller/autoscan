# Generated speech fixture

`speech.mka` is a 90,872-byte Matroska file with two lossless 16 kHz mono FLAC audio streams: speech at index 0, silence
at index 1. No third-party recording is used. The generator synthesizes two short sentences with macOS `say` (Samantha,
190 words/min), decodes them to PCM, trims each utterance's outer silence at 1% of its peak amplitude, then places them
at seconds 1 and 7 in a 16-second silent buffer. `known.json` records those independently generated utterance bounds;
Silero is not used to generate the expected intervals.

Regenerate on macOS with `say`, Bun and ffmpeg available:

```sh
bun tests/fixtures/speech/generate.ts
```

SHA-256 of the committed fixture:
`88b6b733857240d5ff7e7527342dbaa7d45454b74013b01fc4543040159b6ba5`.
Matroska metadata can differ on regeneration; the committed interval metadata corresponds to the committed audio.

Run the sampling and offline packaging tests:

```sh
bun test tests/integrations/ffmpeg/
```

The compiled test builds `tests/integrations/ffmpeg/compiled_smoke.ts`, copies the fixture to a scoped temporary directory
without `node_modules`, and launches the binary there with macOS `sandbox-exec` denying all networking and reads of the
repository's `node_modules` and `src`. It runs on macOS only. On Linux, `nix build .#checks.x86_64-linux.speech-offline`
runs the same smoke inside the network-less build sandbox; CI runs it. The smoke checks accuracy within 0.3 seconds,
a silent window and stream, deterministic repeat calls, and per-window state isolation. Source-level tests additionally
check EOF/short-frame behavior, declared failures, temporary-directory cleanup and interruption propagation.

Manual macOS equivalent:

```sh
fixture="$PWD/tests/fixtures/speech/speech.mka"
bun build --compile tests/integrations/ffmpeg/compiled_smoke.ts --outfile /tmp/autoscan-speech-smoke
work=$(mktemp -d)
(cd "$work" && sandbox-exec -p '(version 1)(allow default)(deny network*)' /tmp/autoscan-speech-smoke "$fixture")
rmdir "$work"
```
