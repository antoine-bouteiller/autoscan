import json, sys, pathlib, mlx_whisper
src, dst = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
dst.mkdir(parents=True, exist_ok=True)
for clip in sorted(src.glob("*.flac")):
    out = dst / (clip.stem + ".json")
    if out.exists():
        continue
    r = mlx_whisper.transcribe(str(clip), path_or_hf_repo="mlx-community/whisper-large-v3-turbo",
                               word_timestamps=True, condition_on_previous_text=False, verbose=None)
    segs = [{"start": s["start"], "end": s["end"], "no_speech_prob": s["no_speech_prob"],
             "avg_logprob": s["avg_logprob"], "compression_ratio": s["compression_ratio"],
             "words": [[w["start"], w["end"], w["probability"]] for w in s.get("words", [])]} for s in r["segments"]]
    out.write_text(json.dumps({"language": r["language"], "segments": segs}))
    print(clip.stem, r["language"], len(segs), flush=True)
