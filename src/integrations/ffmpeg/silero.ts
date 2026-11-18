import { Effect } from 'effect'
import { env, InferenceSession, Tensor } from 'onnxruntime-web/wasm'

import { SpeechActivityError } from '@/integrations/ffmpeg/errors'

import mjsPath from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs' with { type: 'file' }
import wasmPath from '../../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm' with { type: 'file' }
import modelPath from './silero/silero_vad.onnx' with { type: 'file' }

const SAMPLE_RATE = 16_000
const FRAME = 512
const CONTEXT = 64
const MIN_SPEECH = SAMPLE_RATE * 0.25
const MIN_SILENCE = SAMPLE_RATE * 0.1
const PAD = SAMPLE_RATE * 0.03

let session: Promise<InferenceSession> | undefined
const loadSession = () => {
  session ??= (async () => {
    env.wasm.numThreads = 1
    env.wasm.proxy = false
    env.wasm.wasmBinary = await Bun.file(wasmPath).arrayBuffer()
    env.wasm.wasmPaths = { mjs: mjsPath }
    return InferenceSession.create(await Bun.file(modelPath).arrayBuffer(), { executionProviders: ['wasm'] })
  })().catch((error: unknown) => {
    session = undefined
    throw error
  })
  return session
}

export const detectSpeech = (bytes: Uint8Array) =>
  Effect.gen(function* () {
    const model = yield* Effect.tryPromise({
      catch: (cause) => SpeechActivityError.make({ cause, details: 'Could not load Silero VAD' }),
      try: loadSession,
    })
    const samples = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    let state: Tensor = new Tensor('float32', new Float32Array(2 * 128), [2, 1, 128])
    const context = new Float32Array(CONTEXT)
    const sr = new Tensor('int64', new BigInt64Array([BigInt(SAMPLE_RATE)]), [])
    const speech: [number, number][] = []
    let start: number | undefined
    let end: number | undefined

    for (let offset = 0; offset < samples.length; offset += FRAME) {
      const frame = new Float32Array(CONTEXT + FRAME)
      frame.set(context)
      frame.set(samples.subarray(offset, offset + FRAME), CONTEXT)
      const result = yield* Effect.tryPromise({
        catch: (cause) => SpeechActivityError.make({ cause, details: 'Silero VAD inference failed' }),
        try: () => model.run({ input: new Tensor('float32', frame, [1, frame.length]), sr, state }),
      })
      state = result['stateN']
      context.set(frame.subarray(frame.length - CONTEXT))
      const probability = Number(result['output'].data[0])
      if (probability >= 0.5) {
        end = undefined
        start ??= offset
      } else if (probability < 0.35 && start !== undefined) {
        end ??= offset
        if (offset - end >= MIN_SILENCE) {
          if (end - start > MIN_SPEECH) {
            speech.push([start, end])
          }
          start = undefined
          end = undefined
        }
      }
    }
    if (start !== undefined && samples.length - start > MIN_SPEECH) {
      speech.push([start, samples.length])
    }
    for (const [index, interval] of speech.entries()) {
      if (index === 0) {
        interval[0] = Math.max(0, interval[0] - PAD)
      }
      const next = speech[index + 1]
      if (next === undefined) {
        interval[1] = Math.min(samples.length, interval[1] + PAD)
      } else {
        const silence = next[0] - interval[1]
        const padding = silence < 2 * PAD ? Math.floor(silence / 2) : PAD
        interval[1] = Math.min(samples.length, interval[1] + padding)
        next[0] = Math.max(0, next[0] - padding)
      }
    }
    return speech.map(([from, to]): [number, number] => [from / SAMPLE_RATE, to / SAMPLE_RATE])
  })
