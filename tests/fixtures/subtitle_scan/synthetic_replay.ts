/* oxlint-disable unicorn/no-null */
import { assessTrack } from '@/features/subtitle_scan/services/subtitle_alignment'
import { passesCoverage, profilePair } from '@/features/subtitle_scan/services/subtitle_profile'

import { auditedEnglish, cut, frenchControls, loadCorpus, quarters, shifts, trackOf, transform } from './corpus'

export const syntheticReplay = async () => {
  const corpus = await loadCorpus()
  const english = auditedEnglish(corpus)
  const shifted = english.flatMap((media) =>
    shifts.map((offset) => ({ applied: offset, id: media.id, result: assessTrack(transform(trackOf(media, 'en').cues, 1, offset), media.windows) }))
  )
  const drifted = english
    .filter((media) => media.duration < 4000)
    .map((media) => ({ id: media.id, result: assessTrack(transform(trackOf(media, 'en').cues, 1.0425, -52), media.windows) }))
  const fitted = [
    ...shifted.map((item) => ({ ...item, offset: item.applied, ratio: 1 })),
    ...drifted.map((item) => ({ ...item, offset: -52, ratio: 1.0425 })),
  ].flatMap((item) => {
    const { fit } = item.result
    const media = corpus.find((candidate) => candidate.id === item.id)
    if (fit === null || media === undefined) {
      return []
    }
    const error = Math.max(
      ...media.windows.map((window) => Math.abs((fit.ratio - item.ratio) * (window.start + window.duration / 2) + fit.offset - item.offset))
    )
    return [{ error, fit, id: item.id, offset: item.offset, ratio: item.ratio }]
  })
  const french = corpus
    .filter((media) => frenchControls.includes(media.id))
    .map((media) => {
      const reference = trackOf(media, 'en').cues
      const track = trackOf(media, 'fr').cues
      const truncated = cut(track, media.duration)
      return {
        coverage: passesCoverage(reference, truncated, media.duration),
        cut: profilePair(reference, truncated, media.duration),
        drifted: profilePair(reference, transform(track, 25 / 23.976, 0), media.duration),
        id: media.id,
        quarters: profilePair(reference, quarters(track, media.duration), media.duration),
        shifted: shifts.map((offset) => ({ offset, result: profilePair(reference, transform(track, 1, offset), media.duration) })),
      }
    })
  const suits = corpus.filter((media) => media.name.startsWith('Suits') && media.tracks.has('en'))
  return {
    cross: english
      .filter((media) => media.name.startsWith('Suits'))
      .flatMap((media) =>
        suits
          .filter((other) => other.id !== media.id)
          .map((other) => ({ id: media.id, other: other.id, result: assessTrack(trackOf(other, 'en').cues, media.windows) }))
      ),
    cut: english.map((media) => ({ id: media.id, result: assessTrack(cut(trackOf(media, 'en').cues, media.duration), media.windows) })),
    drifted,
    fitted,
    french,
    quarters: english.map((media) => ({ id: media.id, result: assessTrack(quarters(trackOf(media, 'en').cues, media.duration), media.windows) })),
    shifted,
  }
}
if (import.meta.main) {
  process.stdout.write(`${JSON.stringify(await syntheticReplay(), null, 2)}\n`)
}
