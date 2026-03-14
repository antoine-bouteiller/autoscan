import { defineConfig } from 'tsdown/config'

export default defineConfig({
  entry: 'src/index.ts',
  format: 'esm',
  platform: 'node',
  outDir: 'dist',
})
