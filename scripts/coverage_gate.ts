import { readFileSync } from 'node:fs'

// Bun's coverageThreshold is per-file only, so this replicates vitest's global gate.
const MIN_FUNCTIONS = 90
const MIN_LINES = 85

const summarize = (lcov: string): { functions: number; lines: number } => {
  let fnf = 0
  let fnh = 0
  let lf = 0
  let lh = 0
  for (const line of lcov.split('\n')) {
    if (line.startsWith('FNF:')) {
      fnf += Number(line.slice(4))
    } else if (line.startsWith('FNH:')) {
      fnh += Number(line.slice(4))
    } else if (line.startsWith('LF:')) {
      lf += Number(line.slice(3))
    } else if (line.startsWith('LH:')) {
      lh += Number(line.slice(3))
    }
  }
  return { functions: fnf ? (fnh / fnf) * 100 : 100, lines: lf ? (lh / lf) * 100 : 100 }
}

const selfCheck = summarize('FNF:4\nFNH:3\nLF:10\nLH:9\n')
if (selfCheck.functions !== 75 || selfCheck.lines !== 90) {
  throw new Error('coverage_gate self-check failed')
}

const { functions, lines } = summarize(readFileSync('coverage/lcov.info', 'utf8'))
const ok = functions >= MIN_FUNCTIONS && lines >= MIN_LINES
process.stdout.write(
  `coverage: functions ${functions.toFixed(2)}% (min ${MIN_FUNCTIONS}) lines ${lines.toFixed(2)}% (min ${MIN_LINES}) -> ${ok ? 'pass' : 'fail'}\n`
)
if (!ok) {
  process.exit(1)
}
