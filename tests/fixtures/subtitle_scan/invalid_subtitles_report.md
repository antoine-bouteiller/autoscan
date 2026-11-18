# Invalid subtitle audit — 2026-11-15

Scope: the 81 `subtitle_scans` rows with `verdict = 'invalid'` at scan version 2 (44 media files).

| Outcome                                                                 | Rows |
| ----------------------------------------------------------------------- | ---- |
| Delete (content, cut, or timing is wrong)                               | 44   |
| False positive (in sync, keep)                                          | 33   |
| Constant offset (keep only after a successful resync, otherwise delete) | 4    |

Five Desperate Housewives English tracks marked `passed` also drift, so they join the delete list (49 deletions in total).

## Method

- For each media file I extracted eight 40 s audio windows, at 6 %, 18 %, …, 90 % of runtime. On the host this ran under `nice -n19 ionice -c3`. All 352 clips took 2 min 38 s, and the host also served one 2.4 MB tar of the sidecars and two `ffprobe` passes. Everything else ran locally.
- Whisper large-v3-turbo transcribed the clips with word timestamps.
- **English** offset per window: I aligned whisper segment text to cue text and took the median of `cue start − speech start`. Whisper starts about 0.1–0.3 s late, so 0.0–0.4 means in sync.
- **French** offset per window has three independent checks: (1) correlation of the speech mask with the cue mask over ±120 s, (2) proper-noun and number anchors between French cues and the English cues across the whole file, added to the English absolute offset, and (3) a direct read of the French text against the transcript where (1) and (2) disagreed.
- Windows with only music or whisper hallucinations were ignored. Examples are the song sequences in A Star Is Born and the silent stretches in Life of Pi, Mr. Nobody, and The Pianist.
- Offsets are given as `+` (subtitle late) or `−` (subtitle early), in seconds, from start to end of the file. "Drift" means a roughly linear change, which points to a framerate mismatch. "Other cut" means piecewise jumps or cues that run past the runtime.

## Delete (44 + 5)

### Movies

| Media                         | Lang | Evidence                                                                                                 |
| ----------------------------- | ---- | -------------------------------------------------------------------------------------------------------- |
| A Star Is Born (2018)         | en   | Text matches speech in 1 of 8 windows. Bazarr's 2026-10-03 sync applied scale 0.96.                      |
| Life of Pi (2012)             | fr   | Drift +4.8 → −30 s. The English track is in sync.                                                        |
| Man on Fire (2004)            | en   | Text matches speech in 0 of 8 windows. Bazarr's 2026-09-23 sync applied scale 1.04.                      |
| Mr. Nobody (2009)             | fr   | Other cut. Cues end at 9176 s against a runtime of 8343 s, and anchor offsets range from +30 to +1300 s. |
| Project X (2012)              | en   | In sync for the first 20 %, then +31, +48, +66 s.                                                        |
| Scary Movie 3 (2003)          | fr   | Segment offsets −35 → −6 → 0 → +3 s.                                                                     |
| Scary Movie 5 (2013)          | en   | Segment offsets −35, −31, +3, +60 s.                                                                     |
| Scary Movie 5 (2013)          | fr   | Same timing as the English track (±2 s), so it is equally wrong.                                         |
| Star Wars (1977)              | fr   | Offsets jump from −12 to +108 s. Bazarr's 2026-10-03 sync applied scale 1.04.                            |
| The Godfather Part III (1990) | fr   | In sync for the first ~30 min, then −220 → −630 s (other cut).                                           |
| The Hateful Eight (2015)      | en   | Cues stop at 46 min of 168 min. This is the 2026-09-23 19:05 re-download, still truncated.               |

### TV

| Media                       | Lang | Evidence                                                                                                                  |
| --------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------- |
| Black Sails S01E08          | fr   | No consistent offset (+36, +30, −58 s by segment).                                                                        |
| Desperate Housewives S01E02 | fr   | Drift ≈ 4 % (−28 → +36 s), which points to 25 fps timing.                                                                 |
| Desperate Housewives S01E06 | fr   | Drift ≈ 4 %.                                                                                                              |
| Desperate Housewives S01E07 | fr   | Drift ≈ 4 %.                                                                                                              |
| Desperate Housewives S01E06 | en   | Was `passed`. Drift −41 → +67 s.                                                                                          |
| Desperate Housewives S01E07 | en   | Was `passed`. Drift −49 → +44 s.                                                                                          |
| Desperate Housewives S01E11 | en   | Was `passed`. Drift −23 → +87 s.                                                                                          |
| Desperate Housewives S01E17 | en   | Was `passed`. Drift −28 → +74 s.                                                                                          |
| Desperate Housewives S01E22 | en   | Was `passed`. Drift −38 → +76 s.                                                                                          |
| Desperate Housewives S01E17 | fr   | Drift ≈ 4 %.                                                                                                              |
| Desperate Housewives S01E22 | fr   | Drift ≈ 4 %.                                                                                                              |
| House of the Dragon S02E03  | en   | Drift −41 → +94 s (≈ 4 %).                                                                                                |
| House of the Dragon S02E03  | fr   | English timing +2.7 s, with the same drift.                                                                               |
| Suits S01E01                | fr   | Shorter broadcast cut: −170 → −560 s, and cues end at 4246 s of 4875 s.                                                   |
| Suits S01E04                | fr   | Different episode (Gene Simmons storyline). Only 3 of 26 names appear in the English track. Cues end at 1197 s of 2582 s. |
| Suits S01E06                | fr   | Different episode. 14 of 87 names appear in the English track.                                                            |
| Suits S01E08                | fr   | Different episode. 12 of 54 names appear in the English track.                                                            |
| Suits S01E10                | fr   | Drift +3.4 → −1.4 s. Borderline: only the first third is noticeably late.                                                 |
| Suits S01E11                | fr   | Drift +6.8 → 0 s.                                                                                                         |
| Suits S02E01                | en   | Other cut. Cues end at 2844 s against a runtime of 2587 s, and the track is ~14 s late mid-episode.                       |
| Suits S02E01                | fr   | Same longer cut, with cues ending at 2825 s.                                                                              |
| Suits S02E04                | en   | Drift +2.0 → −3.6 s. Borderline: the middle is in sync.                                                                   |
| Suits S02E04                | fr   | Drift +2.7 → −5.7 s.                                                                                                      |
| Suits S02E11                | en   | Drift +2.8 → −2.7 s.                                                                                                      |
| Suits S02E11                | fr   | Drift +5.5 → −3.4 s.                                                                                                      |
| Suits S02E13                | en   | Drift +3.1 → −6.7 s.                                                                                                      |
| Suits S02E13                | fr   | Drift +9.6 → −1.9 s.                                                                                                      |
| Suits S02E16                | en   | Drift +3.5 → −5.0 s.                                                                                                      |
| Suits S02E16                | fr   | Other cut: −34 → +338 s.                                                                                                  |
| Suits S03E01                | en   | Drift +1.8 → −3.4 s. Borderline.                                                                                          |
| Suits S03E01                | fr   | Drift +4.4 → −2.0 s.                                                                                                      |
| Suits S03E11                | fr   | Drift +3.8 → −6.8 s.                                                                                                      |
| Suits S05E01                | fr   | Drift +8.6 → −18 s.                                                                                                       |
| Suits S05E03                | fr   | Different content. 12 of 37 names appear in the English track, and the text does not match the dialogue.                  |
| Suits S05E04                | fr   | Drift +26 → −26 s.                                                                                                        |
| Suits S05E10                | fr   | Drift −1.4 → −59 s.                                                                                                       |
| Suits S06E16                | en   | Drift +6.8 → −5.9 s.                                                                                                      |
| The White Lotus S01E05      | fr   | −1 to −3 s at 30 %, then +30 → +80 s.                                                                                     |

## Constant offset (4)

Each of these tracks has the right content and a steady offset, so one shift fixes it. Bazarr's last sync failed (`scale 0.00`) for Fleabag and Medici. A manual shift or a re-download is the realistic fix for those two.

| Media                                 | Lang | Offset           | Note                                                                                                                                                 |
| ------------------------------------- | ---- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| The Good, the Bad and the Ugly (1966) | fr   | +5.0 s (4.6–5.3) | The invalid verdict (2026-09-23 14:01) predates the 2026-09-23 19:05 re-download, so the stale verdict was reused for the new file at the same path. |
| Fleabag S01E05                        | en   | +43.9 s          | Bazarr's 2026-10-18 sync failed.                                                                                                                     |
| Medici S02E02                         | fr   | −34.5 s          | Bazarr's 2026-11-04 sync failed.                                                                                                                     |
| MobLand S01E01                        | en   | +2.6 s           |                                                                                                                                                      |

## False positives — keep (33)

| Media                                 | Lang | Measured offset | Why it was flagged                                                                                  |
| ------------------------------------- | ---- | --------------- | --------------------------------------------------------------------------------------------------- |
| A Star Is Born (2018)                 | fr   | 0.2–0.8 s       | Sibling (en) is broken                                                                              |
| Life of Pi (2012)                     | en   | 0.1 s           | Sibling (fr) is broken                                                                              |
| Man on Fire (2004)                    | fr   | 0.2–0.4 s       | Sibling (en) is broken                                                                              |
| Mr. Nobody (2009)                     | en   | −0.1–0.2 s      | Sibling (fr) is broken                                                                              |
| Project X (2012)                      | fr   | 0.0–0.4 s       | Sibling (en) is broken                                                                              |
| Scary Movie 3 (2003)                  | en   | 0.1–0.3 s       | Sibling (fr) is broken                                                                              |
| Star Wars (1977)                      | en   | −0.2–0.3 s      | Sibling (fr) is broken                                                                              |
| The Good, the Bad and the Ugly (1966) | en   | −0.1–0.5 s      | Sibling (fr) offset                                                                                 |
| The Hateful Eight (2015)              | fr   | −0.1–0.4 s      | Sibling (en) truncated                                                                              |
| The Pianist (2002)                    | en   | −0.1–0.6 s      | Both fine. Translations split cues differently, and both have a shared ~13 min no-dialogue stretch. |
| The Pianist (2002)                    | fr   | ≈ en ± 1 s      | Same                                                                                                |
| The Room Next Door (2024)             | en   | −0.4–0.0 s      | Both fine. Cue segmentation differs.                                                                |
| The Room Next Door (2024)             | fr   | 0.2–0.7 s       | Same                                                                                                |
| Black Sails S01E08                    | en   | 0.0–0.6 s       | Sibling (fr) is broken                                                                              |
| Desperate Housewives S01E11           | fr   | 0.0–0.3 s       | Sibling (en) drifts. See the note below.                                                            |
| Fleabag S01E05                        | fr   | 0.2–0.5 s       | Sibling (en) offset                                                                                 |
| Medici S02E02                         | en   | 0.1–0.8 s       | Sibling (fr) offset                                                                                 |
| MobLand S01E01                        | fr   | 0.2–0.5 s       | Sibling (en) offset                                                                                 |
| Suits S01E01                          | en   | 0.0–0.2 s       | Sibling (fr) is broken                                                                              |
| Suits S01E04                          | en   | 0.0–0.6 s       | Sibling (fr) is broken                                                                              |
| Suits S01E06                          | en   | 0.1–0.4 s       | Sibling (fr) is broken                                                                              |
| Suits S01E08                          | en   | 0.0–0.4 s       | Sibling (fr) is broken                                                                              |
| Suits S01E10                          | en   | 0.1–0.3 s       | Sibling (fr) drifts                                                                                 |
| Suits S01E11                          | en   | −0.1–0.4 s      | Sibling (fr) drifts                                                                                 |
| Suits S03E11                          | en   | −0.5–1.0 s      | Sibling (fr) drifts                                                                                 |
| Suits S05E01                          | en   | 0.0–0.9 s       | Sibling (fr) drifts                                                                                 |
| Suits S05E03                          | en   | 0.1–0.2 s       | Sibling (fr) is broken                                                                              |
| Suits S05E04                          | en   | 0.0–0.3 s       | Sibling (fr) drifts                                                                                 |
| Suits S05E10                          | en   | −0.6–0.1 s      | Sibling (fr) drifts                                                                                 |
| Suits S05E16                          | en   | −0.9–0.4 s      | Both fine                                                                                           |
| Suits S05E16                          | fr   | −1.3 to −0.4 s  | Both fine. Subtitles appear up to ~1 s early.                                                       |
| Suits S06E16                          | fr   | 0.0–0.4 s       | Sibling (en) drifts                                                                                 |
| The White Lotus S01E05                | en   | −0.1–0.3 s      | Sibling (fr) is broken                                                                              |

## Findings outside the invalid list

- **Broken subtitles marked `passed`:** the Desperate Housewives S01 English tracks for E06, E07, E11, E17, and E22 drift by ≈ 4 % (about −40 → +85 s). They are now on the delete list. Each was the timing reference that condemned its French sibling. E11 French is actually in sync. E02 English is fine. The three `sync_requested` French tracks (E04, E08, E10) likely have the same drift. I did not check them, and they are not on the delete list.
- **Why the scan gets this wrong:** the timing comparator flags both siblings whenever they disagree. A good track is therefore marked invalid whenever its sibling is broken. That explains 27 of the 33 false positives. The other 6 are sibling pairs that are both in sync but split cues differently (The Pianist, The Room Next Door, Suits S05E16).
- **Bazarr sync made several files worse.** It applied a wrong framerate scale (0.96 or 1.04) to A Star Is Born en, Man on Fire en and fr, Star Wars fr, and Mr. Nobody fr. Re-syncing those through Bazarr will not help.
- **Stale verdicts:** The Good, the Bad and the Ugly fr and The Hateful Eight en were re-downloaded after their invalid verdict. Path-keyed verdicts carried over to the new files. The new Hateful Eight English track is still truncated. The new GBU French track only needs a +5 s shift.
- **Re-download risk:** deleting through Bazarr returns the language to the wanted list, and Bazarr may fetch the same subtitle again. The Suits NF episodes have English and French tracks that drift alike, which suggests no provider has a release-matched subtitle. Blacklisting the deleted subtitle in Bazarr avoids a loop.

## Recommendations to improve detection

The current pass (`subtitle_scan.service.ts`) uses one signal: fewer than 50 % of cue starts match a sibling within 500 ms. A mismatch triggers a Bazarr sync. A recheck that still mismatches is marked `invalid` without further evidence. Ordered by expected impact on this sample:

1. **Arbitrate sibling disagreement with audio before alerting.** `divergentCandidates` flags both files of a mismatching pair, and the recheck condemns both. That pattern accounts for 27 of the 33 false positives. The spec already calls for a bounded audio assessment on `sync_requested` rechecks (`[G-5]`, `[KD-6.1]`), but the code skips it. A cheap version is enough: decode 6–8 windows of 30–40 s at 16 kHz mono, run a VAD (Silero or WebRTC, no ASR needed), and correlate the speech mask with each track's cue mask at offset 0 and over ±120 s. In this audit, per-window correlation at offset 0 was mostly 0.4–0.9 for in-sync tracks and mostly −0.2–0.3 for broken ones, which also had a stronger peak at another offset. Single windows overlap, so decide on the median across windows. Only the track that fails gets the verdict.
2. **Compare siblings by offset, not by raw cue-start matches.** Translations split and merge cues, so two in-sync tracks score 0.46–0.50 on the 500 ms ratio (The Pianist, The Room Next Door, Suits S05E16). That explains the other 6 false positives. Instead, estimate the best offset per quarter of the runtime with an offset histogram, then classify the pair:
   - constant offset (same shift in every quarter): repairable with one shift
   - linear drift (shift grows with time, ratio ≈ 1.04 or 0.96): framerate mismatch
   - piecewise jumps: another cut
   - no stable peak: different content

   The Room Next Door goes from 0.48 raw to 0.84 at −0.5 s, which is in sync.

3. **Add cheap structural checks before any timing comparison.**
   - **Runtime coverage:** the last cue ending well before the runtime or past it catches The Hateful Eight en (46 of 168 min), Suits S01E04 fr, Suits S01E01 fr, Mr. Nobody fr, and Suits S02E01 en and fr.
   - **Cross-language anchors:** compare proper nouns and numbers shared by the siblings. Correct pairs share over 75 % of names. Different episodes share under 35 %, as for Suits S01E04, S01E06, S01E08 and S05E03 fr.

   Both checks are text-only.

4. **Read Bazarr's sync result instead of assuming success.** Bazarr history records the offset and the framerate scale of every sync. `scale 0.00` means the sync failed (Fleabag, Medici, and most Suits French tracks). A 0.96 or 1.04 scale on one sibling while the other stays at 1.00 means Bazarr guessed the framerate wrong (A Star Is Born en, Man on Fire, Star Wars fr, Mr. Nobody fr). Treat a failed sync as unresolved timing, not as evidence of invalidity, and don't request a sync that will rescale a track whose sibling is aligned.
5. **Don't trust an unverified `passed` reference.** A track passes when no sibling disagrees with it, so a broken first download becomes the reference that condemns a later good one. That happened with the Desperate Housewives English tracks. Either confirm a reference with the audio check from recommendation 1 before using it to judge another track, or record that it is unverified.
6. **Invalidate verdicts when the file changes.** Store the size and mtime with the path. A `stat` costs nothing and would have re-scanned the re-downloaded GBU fr and Hateful Eight en instead of reusing their old verdicts.
7. **Repair constant offsets directly.** When recommendation 2 finds a constant offset and Bazarr's sync fails, apply the shift through Bazarr's subtitle offset modification instead of alerting. That would have fixed all 4 constant-offset tracks.
8. **Blacklist on delete and only translate from verified sources.** Deleting without a blacklist lets Bazarr fetch the same file again. Use Bazarr's blacklist endpoint with the provider and `subs_id` from history. The Desperate Housewives French tracks were translated from drifting English tracks and inherited the drift. Only translate from a track that passed recommendation 1.

## Appendix — full paths

### Delete

```
/mnt/media/library/movies/A Star Is Born (2018) {tmdb-332562}/A Star Is Born (2018) {tmdb-332562} - [AMZN][WEBDL-1080p][EAC3 5.1][h264]-GPRS.en.srt
/mnt/media/library/movies/Life of Pi (2012) {tmdb-87827}/Life of Pi (2012) {tmdb-87827} - [Bluray-1080p Proper][AC3 5.1][x265]-YAWNTiC.fr.srt
/mnt/media/library/movies/Man on Fire (2004) {tmdb-9509}/Man on Fire (2004) {tmdb-9509} - [WEBDL-1080p][AC3 5.1][x264]-UBWEB.en.srt
/mnt/media/library/movies/Mr. Nobody (2009) {tmdb-31011}/Mr. Nobody (2009) {tmdb-31011} - {edition-Theatrical} [Bluray-1080p][DTS 5.1][x265]-LiNUX.fr.srt
/mnt/media/library/movies/Project X (2012) {tmdb-57214}/Project X (2012) {tmdb-57214} - [WEBRip-1080p][EAC3 5.1][x264]-moon.en.srt
/mnt/media/library/movies/Scary Movie 3 (2003) {tmdb-4256}/Scary Movie 3 (2003) {tmdb-4256} - [PMTP][WEBDL-1080p][EAC3 5.1][x264]-PiRaTeS.fr.srt
/mnt/media/library/movies/Scary Movie 5 (2013) {tmdb-4258}/Scary Movie 5 (2013) {tmdb-4258} - [Bluray-1080p][AC3 5.1][x265]-Licdom.en.srt
/mnt/media/library/movies/Scary Movie 5 (2013) {tmdb-4258}/Scary Movie 5 (2013) {tmdb-4258} - [Bluray-1080p][AC3 5.1][x265]-Licdom.fr.srt
/mnt/media/library/movies/Star Wars (1977) {tmdb-11}/Star Wars (1977) {tmdb-11} - [DSNP][WEBDL-1080p][EAC3 Atmos 5.1][h264]-PiRaTeS.fr.srt
/mnt/media/library/movies/The Godfather Part III (1990) {tmdb-242}/The Godfather Part III (1990) {tmdb-242} - [Bluray-1080p][AC3 5.1][x264]-MIRCrew.fr.srt
/mnt/media/library/movies/The Hateful Eight (2015) {tmdb-273248}/The Hateful Eight (2015) {tmdb-273248} - [AMZN PCOK][WEBDL-1080p][EAC3 5.1][h264]-PiRaTeS.en.srt
/mnt/media/library/tv/Black Sails (2014) {tmdb-47665}/Season 01/Black Sails (2014) - S01E08 - VIII [AMZN][WEBDL-1080p][EAC3 5.1][h265]-SiGMA.fr.srt
/mnt/media/library/tv/Desperate Housewives (2004) {tmdb-693}/Season 01/Desperate Housewives (2004) - S01E02 - Ah but Underneath [AMZN][WEBDL-1080p][EAC3 5.1][h265]-SiGMA.fr.srt
/mnt/media/library/tv/Desperate Housewives (2004) {tmdb-693}/Season 01/Desperate Housewives (2004) - S01E06 - Running to Stand Still [AMZN][WEBDL-1080p][EAC3 5.1][h265]-SiGMA.fr.srt
/mnt/media/library/tv/Desperate Housewives (2004) {tmdb-693}/Season 01/Desperate Housewives (2004) - S01E07 - Anything You Can Do [AMZN][WEBDL-1080p][EAC3 5.1][h265]-SiGMA.fr.srt
/mnt/media/library/tv/Desperate Housewives (2004) {tmdb-693}/Season 01/Desperate Housewives (2004) - S01E17 - There Wont Be Trumpets [AMZN][WEBDL-1080p][EAC3 5.1][h265]-SiGMA.fr.srt
/mnt/media/library/tv/Desperate Housewives (2004) {tmdb-693}/Season 01/Desperate Housewives (2004) - S01E22 - Goodbye for Now [AMZN][WEBDL-1080p][EAC3 5.1][h265]-SiGMA.fr.srt
/mnt/media/library/tv/House of the Dragon (2022) {tmdb-94997}/Season 02/House of the Dragon (2022) - S02E03 - The Burning Mill [AMZN v2][WEBDL-1080p Proper][EAC3 5.1][h264]-MeM.en.srt
/mnt/media/library/tv/House of the Dragon (2022) {tmdb-94997}/Season 02/House of the Dragon (2022) - S02E03 - The Burning Mill [AMZN v2][WEBDL-1080p Proper][EAC3 5.1][h264]-MeM.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 01/Suits (2011) - S01E01 - Pilot [Bluray-1080p][AAC 5.1][x265]-RARBG.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 01/Suits (2011) - S01E04 - Dirty Little Secrets [Bluray-1080p][AAC 5.1][x265]-RARBG.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 01/Suits (2011) - S01E06 - Tricks of the Trade [Bluray-1080p][AAC 5.1][x265]-RARBG.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 01/Suits (2011) - S01E08 - Identity Crisis [Bluray-1080p][AAC 5.1][x265]-RARBG.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 01/Suits (2011) - S01E10 - Shelf Life [Bluray-1080p][AAC 5.1][x265]-RARBG.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 01/Suits (2011) - S01E11 - Rules of the Game [Bluray-1080p][AAC 5.1][x265]-RARBG.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 02/Suits (2011) - S02E01 - She Knows [NF][WEBDL-1080p][EAC3 5.1][x264]-playWEB.en.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 02/Suits (2011) - S02E01 - She Knows [NF][WEBDL-1080p][EAC3 5.1][x264]-playWEB.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 02/Suits (2011) - S02E04 - Discovery [NF][WEBDL-1080p][EAC3 5.1][x264]-playWEB.en.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 02/Suits (2011) - S02E04 - Discovery [NF][WEBDL-1080p][EAC3 5.1][x264]-playWEB.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 02/Suits (2011) - S02E11 - Blind-Sided [NF][WEBDL-1080p][EAC3 5.1][x264]-playWEB.en.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 02/Suits (2011) - S02E11 - Blind-Sided [NF][WEBDL-1080p][EAC3 5.1][x264]-playWEB.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 02/Suits (2011) - S02E13 - Zane vs. Zane [NF][WEBDL-1080p][EAC3 5.1][x264]-playWEB.en.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 02/Suits (2011) - S02E13 - Zane vs. Zane [NF][WEBDL-1080p][EAC3 5.1][x264]-playWEB.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 02/Suits (2011) - S02E16 - War [NF][WEBDL-1080p][EAC3 5.1][x264]-playWEB.en.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 02/Suits (2011) - S02E16 - War [NF][WEBDL-1080p][EAC3 5.1][x264]-playWEB.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 03/Suits (2011) - S03E01 - The Arrangement [NF][WEBDL-1080p][EAC3 5.1][x264]-playWEB.en.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 03/Suits (2011) - S03E01 - The Arrangement [NF][WEBDL-1080p][EAC3 5.1][x264]-playWEB.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 03/Suits (2011) - S03E11 - Buried Secrets [NF][WEBDL-1080p][EAC3 5.1][x264]-playWEB.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 05/Suits (2011) - S05E01 - Denial [Bluray-1080p][AAC 5.1][x265]-RARBG.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 05/Suits (2011) - S05E03 - No Refills [Bluray-1080p][AAC 5.1][x265]-RARBG.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 05/Suits (2011) - S05E04 - No Puedo Hacerlo [Bluray-1080p][AAC 5.1][x265]-RARBG.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 05/Suits (2011) - S05E10 - Faith [NF][WEBDL-1080p][EAC3 5.1][x264]-playWEB.fr.srt
/mnt/media/library/tv/Suits (2011) {tmdb-37680}/Season 06/Suits (2011) - S06E16 - Character and Fitness [Bluray-1080p][AAC 5.1][x265]-RARBG.en.srt
/mnt/media/library/tv/The White Lotus (2021) {tmdb-111803}/Season 01/The White Lotus (2021) - S01E05 - The Lotus-Eaters [AMZN][WEBDL-1080p Proper][AC3 5.1][h264]-MeM.fr.srt
/mnt/media/library/tv/Desperate Housewives (2004) {tmdb-693}/Season 01/Desperate Housewives (2004) - S01E06 - Running to Stand Still [AMZN][WEBDL-1080p][EAC3 5.1][h265]-SiGMA.en.srt
/mnt/media/library/tv/Desperate Housewives (2004) {tmdb-693}/Season 01/Desperate Housewives (2004) - S01E07 - Anything You Can Do [AMZN][WEBDL-1080p][EAC3 5.1][h265]-SiGMA.en.srt
/mnt/media/library/tv/Desperate Housewives (2004) {tmdb-693}/Season 01/Desperate Housewives (2004) - S01E11 - Move On [AMZN][WEBDL-1080p][EAC3 5.1][h265]-SiGMA.en.srt
/mnt/media/library/tv/Desperate Housewives (2004) {tmdb-693}/Season 01/Desperate Housewives (2004) - S01E17 - There Wont Be Trumpets [AMZN][WEBDL-1080p][EAC3 5.1][h265]-SiGMA.en.srt
/mnt/media/library/tv/Desperate Housewives (2004) {tmdb-693}/Season 01/Desperate Housewives (2004) - S01E22 - Goodbye for Now [AMZN][WEBDL-1080p][EAC3 5.1][h265]-SiGMA.en.srt
```

### Constant offset

```
/mnt/media/library/movies/The Good the Bad and the Ugly (1966) {tmdb-429}/The Good the Bad and the Ugly (1966) {tmdb-429} - {edition-Extended} [Bluray-1080p][AC3 5.1][DV HDR10][x265]-Chivaman.fr.srt
/mnt/media/library/tv/Fleabag (2016) {tmdb-67070}/Season 01/Fleabag (2016) - S01E05 - Episode 5 [WEBDL-1080p][AAC 2.0][h264]-NTb.en.srt
/mnt/media/library/tv/Medici (2016) {tmdb-66761}/Season 02/Medici (2016) - S02E02 - Standing Alone [Bluray-1080p][AAC 5.1][x265]-Silence.fr.srt
/mnt/media/library/tv/MobLand (2025) {tmdb-247718}/Season 01/MobLand (2025) - S01E01 - Stick or Twist [AMZN][WEBDL-1080p][EAC3 2.0][h264]-Kitsune.en.srt
```
