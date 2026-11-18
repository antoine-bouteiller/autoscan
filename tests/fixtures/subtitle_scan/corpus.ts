import { type Cue, type Fit } from '@/features/subtitle_scan/services/subtitle_profile'
import { type SpeechWindow } from '@/integrations/ffmpeg/ffmpeg.service'

export interface CorpusTrack {
  language: string
  status: string
  label: string
  cues: Cue[]
}
export interface CorpusMedia {
  id: string
  name: string
  duration: number
  windows: SpeechWindow[]
  tracks: Map<string, CorpusTrack>
}
const intervals = (text: string): (readonly [number, number])[] =>
  text === ''
    ? []
    : text.split(',').map((pair) => {
        const [start, end] = pair.split('-')
        return [Number(start), Number(end)] as const
      })
const readCues = (text: string): Cue[] =>
  text.split(',').map((row) => {
    const [times, anchors] = row.split(':')
    const [start, end] = times.split('-')
    return { anchors: anchors === undefined ? [] : anchors.split('|'), end: Number(end), start: Number(start) }
  })
export const loadCorpus = async (): Promise<CorpusMedia[]> => {
  const text = await Bun.file(new URL('audit_corpus.txt', import.meta.url)).text()
  const media = new Map<string, CorpusMedia>()
  for (const line of text.trim().split('\n')) {
    const [kind, id, ...fields] = line.split('\t')
    if (kind === 'M') {
      media.set(id, { duration: Number(fields[0]), id, name: fields[1], tracks: new Map(), windows: [] })
      continue
    }
    const item = media.get(id)
    if (item === undefined) {
      throw new Error(`Missing media ${id}`)
    }
    if (kind === 'W') {
      item.windows.push({ duration: Number(fields[1]), speech: intervals(fields[2]), start: Number(fields[0]) })
    }
    if (kind === 'T') {
      item.tracks.set(fields[0], { cues: [], label: fields[2], language: fields[0], status: fields[1] })
    }
    if (kind === 'C') {
      const track = item.tracks.get(fields[0])
      if (track === undefined) {
        throw new Error(`Missing track ${id}/${fields[0]}`)
      }
      track.cues = readCues(fields[1])
    }
  }
  return [...media.values()]
}
export const trackOf = (media: CorpusMedia, language: string): CorpusTrack => {
  const track = media.tracks.get(language)
  if (track === undefined) {
    throw new Error(`Missing ${media.id}/${language}`)
  }
  return track
}
export const auditedEnglish = (media: readonly CorpusMedia[]): CorpusMedia[] =>
  media.filter((item) => {
    const track = item.tracks.get('en')
    return track?.status === 'audited' && track.label === 'in_sync'
  })
export const transform = (cues: readonly Cue[], ratio: number, offset: number): Cue[] =>
  cues.map((cue) => ({ ...cue, end: cue.end * ratio + offset, start: cue.start * ratio + offset }))
export const correct = (cues: readonly Cue[], fit: Fit): Cue[] => transform(cues, 1 / fit.ratio, -fit.offset / fit.ratio)
export const quarters = (cues: readonly Cue[], duration: number): Cue[] =>
  cues.map((cue) => {
    const offset = [0, 31, 48, 66][Math.min(3, Math.max(0, Math.floor((cue.start * 4) / duration)))]
    return { ...cue, end: cue.end + offset, start: cue.start + offset }
  })
export const cut = (cues: readonly Cue[], duration: number): Cue[] => cues.filter((cue) => cue.end <= duration * 0.46)
export const frenchControls = ['m03', 'm10', 'm12', 'm13', 'm24', 'm43']
export const shifts = [2.6, 5, -34.5, 43.9]
const intervalCues = (line: string) => intervals(line.slice(3)).map(([start, end]) => ({ anchors: [], end: end / 1000, start: start / 1000 }))
export const loadInterstellar = async () => {
  const text = await Bun.file(new URL('real_intervals.txt', import.meta.url)).text()
  const lines = text.trim().split('\n')
  const index = lines.findIndex((line) => line.startsWith('interstellar '))
  const duration = Number(lines[index].split(' ')[1]) / 1000
  return { duration, reference: intervalCues(lines[index + 1]), track: intervalCues(lines[index + 2]) }
}
