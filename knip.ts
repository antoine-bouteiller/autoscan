import { defineKnipConfig } from '@antoine-bouteiller/devkit'

export default defineKnipConfig({
  entry: ['tests/**/*.spec.ts', 'tests/fixtures/speech/generate.ts'],
  project: ['src/**/*.ts!', 'tests/**/*.ts'],
})
