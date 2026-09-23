`speech.ogg` is a small synthesized English speech fixture generated locally with
macOS `say`, then converted to mono 16 kHz Opus at 12 kbit/s. It contains:

> The quick brown fox jumps over the lazy dog. This is a short speech sample for testing voice activity.

No network service or personal recording was used. Tests generate silence,
stereo tracks, and delayed audio from this fixture using the Effect FFmpeg spawner.
