import { Effect, FileSystem } from 'effect'
import wasmPath from 'onnxruntime-web/ort-wasm-simd-threaded.wasm' with { type: 'file' }
import { env, InferenceSession, Tensor } from 'onnxruntime-web/wasm'

import { type SpeechActivity } from '@/integrations/ffmpeg/ffmpeg.service'
import modelPath from '@/integrations/ffmpeg/models/silero_vad.onnx' with { type: 'file' }
import { ValidationError } from '@/shared/errors/validation'

const SAMPLE_RATE = 16_000
const FRAME_SAMPLES = 512
const CONTEXT_SAMPLES = 64
const FRAME_BYTES = FRAME_SAMPLES * 2
const SPEECH_THRESHOLD = 0.5

/** Read bounded PCM chunks, retaining partial frames across reads. */
export const readSpeechActivity = (path: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const file = yield* fs.open(path)
    env.wasm.numThreads = 1
    env.wasm.proxy = false
    env.wasm.wasmBinary = yield* fs.readFile(wasmPath)
    const model = yield* fs.readFile(modelPath)
    const session = yield* Effect.acquireRelease(
      Effect.tryPromise({
        catch: (cause) => new ValidationError({ cause, details: 'Could not initialize Silero speech detector' }),
        try: () => InferenceSession.create(model, { executionProviders: ['wasm'] }),
      }),
      (detector) => Effect.promise(() => detector.release())
    )
    const intervals: [number, number][] = []
    // Silero's 16 kHz contract: 64 preceding samples, 512 new samples, and per-file recurrent state.
    const frame = new Float32Array(CONTEXT_SAMPLES + FRAME_SAMPLES)
    const state = new Float32Array(256)
    const input = new Tensor('float32', frame, [1, frame.length])
    const hidden = new Tensor('float32', state, [2, 1, 128])
    const rate = new Tensor('int64', BigInt64Array.of(BigInt(SAMPLE_RATE)), [])
    const bytes = new Uint8Array(FRAME_BYTES * 128)
    const view = new DataView(bytes.buffer)
    let buffered = 0
    let samples = 0
    let voiceStart: number | undefined

    const processFrame = (length: number) =>
      Effect.gen(function* () {
        const output = yield* Effect.tryPromise({
          catch: (cause) => new ValidationError({ cause, details: 'Silero speech detection failed' }),
          try: () => session.run({ input, sr: rate, state: hidden }),
        })
        try {
          const probability = output['output']?.data[0]
          const nextState = output['stateN']?.data
          if (
            typeof probability !== 'number' ||
            !Number.isFinite(probability) ||
            probability < 0 ||
            probability > 1 ||
            !(nextState instanceof Float32Array) ||
            nextState.length !== state.length
          ) {
            return yield* new ValidationError({ details: 'Invalid Silero probability or recurrent state' })
          }
          state.set(nextState)
          frame.copyWithin(0, FRAME_SAMPLES)
          if (probability >= SPEECH_THRESHOLD && voiceStart === undefined) {
            voiceStart = samples / SAMPLE_RATE
          }
          if (probability < SPEECH_THRESHOLD && voiceStart !== undefined) {
            intervals.push([voiceStart, samples / SAMPLE_RATE])
            voiceStart = undefined
          }
          samples += length
          return yield* Effect.void
        } finally {
          for (const tensor of Object.values(output)) {
            tensor.dispose()
          }
        }
      }).pipe(Effect.uninterruptible)
    const detect = (end: boolean) =>
      Effect.gen(function* () {
        let offset = 0
        while (buffered - offset >= FRAME_BYTES) {
          for (let index = 0; index < FRAME_SAMPLES; index++) {
            frame[CONTEXT_SAMPLES + index] = view.getInt16(offset + index * 2, true) / 32_768
          }
          yield* processFrame(FRAME_SAMPLES)
          offset += FRAME_BYTES
        }
        bytes.copyWithin(0, offset, buffered)
        buffered -= offset
        if (end && buffered > 0) {
          if (buffered % 2 !== 0) {
            return yield* new ValidationError({ details: 'Decoded PCM has an incomplete sample' })
          }
          frame.fill(0, CONTEXT_SAMPLES)
          for (let index = 0; index < buffered / 2; index++) {
            frame[CONTEXT_SAMPLES + index] = view.getInt16(index * 2, true) / 32_768
          }
          yield* processFrame(buffered / 2)
        }
        return yield* Effect.void
      })

    while (true) {
      const count = yield* file.read(bytes.subarray(buffered))
      buffered += count
      yield* detect(count === 0)
      if (count === 0) {
        break
      }
      yield* Effect.yieldNow
    }
    if (samples === 0) {
      return yield* new ValidationError({ details: 'Selected audio stream decoded to no samples' })
    }
    const duration = samples / SAMPLE_RATE
    if (voiceStart !== undefined) {
      intervals.push([voiceStart, duration])
    }
    return { duration, intervals } satisfies SpeechActivity
  })
