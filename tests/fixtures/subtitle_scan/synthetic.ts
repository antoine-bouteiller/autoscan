import { type Cue } from '@/features/subtitle_scan/services/subtitle_profile'

export const speechFixture = () => {
  const cues: Cue[] = []
  const windows = Array.from({ length: 8 }, (_value, window) => {
    const start = 200 + window * 400
    const speech = Array.from({ length: 8 }, (_item, index) => {
      const at = start + [1, 3.7, 8.9, 10.8, 17.3, 24.2, 28.8, 36.2][index]
      const end = at + 0.8 + ((index * 3 + window) % 7) * 0.2
      cues.push({ anchors: [], end, start: at })
      return [at, end] as const
    })
    return { duration: 40, speech, start }
  })
  return { cues, windows }
}
