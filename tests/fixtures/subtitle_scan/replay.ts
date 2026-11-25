/* oxlint-disable devkit/no-low-signal-symbol-names, unicorn/no-null */
import { assessTrack, type TrackShape } from '@/features/subtitle_scan/services/subtitle_alignment'
import { profilePair } from '@/features/subtitle_scan/services/subtitle_profile'

import { auditedEnglish, correct, cut, frenchControls, loadCorpus, loadInterstellar, quarters, shifts, trackOf, transform } from './corpus'

const counts = (shapes: readonly TrackShape[]) =>
  Object.fromEntries(
    ['aligned', 'constant', 'linear', 'truncated', 'uncorrectable', 'inconclusive'].map((shape) => [
      shape,
      shapes.filter((value) => value === shape).length,
    ])
  )
export const replay = async () => {
  const corpus = await loadCorpus()
  const english = auditedEnglish(corpus)
  const audited = corpus.flatMap((media) =>
    [...media.tracks.values()].filter((track) => track.status === 'audited' && track.label === 'in_sync').map((track) => ({ media, track }))
  )
  const shifted = audited.flatMap(({ media, track }) =>
    shifts.map((offset) => ({ offset, result: assessTrack(transform(track.cues, 1, offset), media.windows) }))
  )
  const suits = corpus.filter((media) => media.name.startsWith('Suits') && media.tracks.has('en'))
  const cross = suits.flatMap((reference) =>
    suits
      .filter((other) => reference.id !== other.id && other.tracks.has('fr'))
      .map((other) => profilePair(trackOf(reference, 'en').cues, trackOf(other, 'fr').cues, reference.duration))
  )
  const french = corpus.filter((media) => frenchControls.includes(media.id))
  const dragon = corpus.find((media) => media.id === 'm23')
  const dragonEn = dragon === undefined ? null : assessTrack(trackOf(dragon, 'en').cues, dragon.windows)
  const interstellar = await loadInterstellar()
  return {
    baseline: {
      auditedCount: audited.length,
      cross: {
        determined: cross.filter((result) => result.segments.some((segment) => segment.offset !== null)).length,
        shapes: Object.fromEntries(
          ['unrelated', 'undetermined', 'agree', 'constant', 'linear', 'piecewise'].map((shape) => [
            shape,
            cross.filter((result) => result.shape === shape).length,
          ])
        ),
        total: cross.length,
      },
      cut: counts(audited.map(({ media, track }) => assessTrack(cut(track.cues, media.duration), media.windows).shape)),
      french25: french.map((media) => ({
        id: media.id,
        ...profilePair(trackOf(media, 'en').cues, transform(trackOf(media, 'fr').cues, 25 / 23.976, 0), media.duration),
      })),
      inaccurateConstant: shifted.filter(
        ({ offset, result }) => result.shape === 'constant' && result.fit !== null && Math.abs(result.fit.offset - offset) > 0.5
      ).length,
      quarters: counts(audited.map(({ media, track }) => assessTrack(quarters(track.cues, media.duration), media.windows).shape)),
      shifted: counts(shifted.map(({ result }) => result.shape)),
    },
    dragonFr:
      dragon !== undefined && dragonEn?.fit !== null && dragonEn?.fit !== undefined
        ? profilePair(correct(trackOf(dragon, 'en').cues, dragonEn.fit), trackOf(dragon, 'fr').cues, dragon.duration)
        : null,
    french: french.map((media) => ({ id: media.id, ...profilePair(trackOf(media, 'en').cues, trackOf(media, 'fr').cues, media.duration) })),
    interstellar: profilePair(interstellar.reference, interstellar.track, interstellar.duration),
    real: ['m22', 'm23', 'm11', 'm16'].map((id) => {
      const media = corpus.find((item) => item.id === id)
      if (media === undefined) {
        throw new Error(id)
      }
      return { id, ...assessTrack(trackOf(media, 'en').cues, media.windows) }
    }),
    realEnglish: english.map((media) => ({ id: media.id, ...assessTrack(trackOf(media, 'en').cues, media.windows) })),
  }
}
if (import.meta.main) {
  process.stdout.write(`${JSON.stringify(await replay(), null, 2)}\n`)
}
