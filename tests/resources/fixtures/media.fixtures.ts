import type { PlexMediaStream } from '@/validators/plex.validator'

export const mockAudioStreams = [
  {
    id: 1,
    languageCode: 'fra',
    selected: false,
    streamType: 2,
  },
  {
    id: 2,
    languageCode: 'eng',
    selected: true,
    streamType: 2,
  },
] as const satisfies PlexMediaStream[]

export const mockAudioStreamSelected = [
  {
    id: 1,
    languageCode: 'eng',
    selected: true,
    streamType: 2,
  },
] as const satisfies PlexMediaStream[]

export const mockAudioStreamNotMatching = [
  {
    id: 1,
    languageCode: 'eng',
    selected: false,
    streamType: 2,
  },
] as const satisfies PlexMediaStream[]

export const mockAudioStreamFrench = [
  {
    id: 1,
    languageCode: 'fra',
    selected: false,
    streamType: 2,
  },
] as const satisfies PlexMediaStream[]

export const mockNonAudioStreams = [
  {
    id: 1,
    languageCode: 'eng',
    selected: false,
    streamType: 1,
  },
  {
    id: 2,
    languageCode: 'eng',
    selected: false,
    streamType: 3,
  },
] as const satisfies PlexMediaStream[]
