import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = import.meta.dir
const directory = await mkdtemp(join(tmpdir(), 'autoscan-speech-fixture-'))
const rate = 16_000
const duration = 16
const utterances = [
  { start: 1, text: 'Bright morning sunshine warms the garden' },
  { start: 7, text: 'Seven small birds fly above the trees' },
]

const run = async (command: string[]) => {
  const process = Bun.spawn(command, { stderr: 'pipe', stdout: 'ignore' })
  if ((await process.exited) !== 0) {
    throw new Error(await new Response(process.stderr).text())
  }
}

try {
  const audio = new Float32Array(duration * rate)
  const speech: [number, number][] = []
  for (const [index, utterance] of utterances.entries()) {
    const source = join(directory, `${index}.aiff`)
    const pcm = join(directory, `${index}.f32`)
    await run(['say', '-v', 'Samantha', '-r', '190', '-o', source, utterance.text])
    await run(['ffmpeg', '-v', 'error', '-i', source, '-ac', '1', '-ar', String(rate), '-f', 'f32le', pcm])
    const samples = new Float32Array(await Bun.file(pcm).arrayBuffer())
    const peak = samples.reduce((value, sample) => Math.max(value, Math.abs(sample)), 0)
    const threshold = peak * 0.01
    const first = samples.findIndex((sample) => Math.abs(sample) > threshold)
    const last = samples.findLastIndex((sample) => Math.abs(sample) > threshold)
    const trimmed = samples.subarray(first, last + 1)
    audio.set(trimmed, utterance.start * rate)
    speech.push([utterance.start, utterance.start + trimmed.length / rate])
  }
  const pcm = join(directory, 'speech.f32')
  await Bun.write(pcm, audio)
  await run([
    'ffmpeg',
    '-v',
    'error',
    '-y',
    '-f',
    'f32le',
    '-ar',
    String(rate),
    '-ac',
    '1',
    '-i',
    pcm,
    '-f',
    'lavfi',
    '-i',
    `anullsrc=r=${rate}:cl=mono`,
    '-t',
    String(duration),
    '-map',
    '0:a:0',
    '-map',
    '1:a:0',
    '-c:a',
    'flac',
    '-sample_fmt',
    's16',
    join(root, 'speech.mka'),
  ])
  await Bun.write(
    join(root, 'known.json'),
    `${JSON.stringify(
      {
        duration,
        generator: 'macOS say, Samantha, 190 words/min; utterances trimmed at 1% of their peak amplitude',
        sampleRate: rate,
        silentStream: 1,
        speech,
        speechStream: 0,
        windows: [
          { duration: 6, start: 0 },
          { duration: 6, start: 6 },
          { duration: 4, start: 12 },
        ],
      },
      undefined,
      2
    )}\n`
  )
} finally {
  await rm(directory, { force: true, recursive: true })
}
