# Silero VAD model

`silero_vad.onnx` is the official ONNX model from [Silero VAD v6.2.3](https://github.com/snakers4/silero-vad/releases/tag/v6.2.3), used at 16 kHz.

- Source commit: `5cd7945676eb32225748052e2e6a0580e4686a08` (`v6.2.3`).
- Source: https://raw.githubusercontent.com/snakers4/silero-vad/5cd7945676eb32225748052e2e6a0580e4686a08/src/silero_vad/data/silero_vad.onnx
- SHA-256: `1a153a22f4509e292a94e67d6f9b85e8deb25b4988682b7e174c65279d8788e3`
- Model license: MIT; see `LICENSE` in this directory.
- ONNX Runtime 1.30.0 license and bundled third-party notices: `ONNX_RUNTIME_LICENSE`, `ONNX_RUNTIME_NOTICES` (from the corresponding upstream release).
- Input contract: 512 new float32 samples plus 64 preceding context samples, recurrent state `[2, 1, 128]`, sample rate 16000. Context and state reset for each audio file, following the release's `OnnxWrapper`.

Bun embeds the model and the pinned ONNX Runtime WASM asset using `type: 'file'` imports. Neither is fetched at runtime. Model/runtime upgrades require rerunning the offline, compiled-binary, and audio regressions; a changed detector may require a subtitle scan-version bump.
