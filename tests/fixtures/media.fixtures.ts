import type { PlexMediaStream } from '@/types/plex'

export const mockAudioStreams: PlexMediaStream[] = [
  {
    id: 1,
    languageCode: 'fre',
    selected: false,
    streamType: 2,
  },
  {
    id: 2,
    languageCode: 'eng',
    selected: true,
    streamType: 2,
  },
]

export const mockAudioStreamSelected: PlexMediaStream[] = [
  {
    id: 1,
    languageCode: 'eng',
    selected: true,
    streamType: 2,
  },
]

export const mockAudioStreamNotMatching: PlexMediaStream[] = [
  {
    id: 1,
    languageCode: 'eng',
    selected: false,
    streamType: 2,
  },
]

export const mockAudioStreamFrench: PlexMediaStream[] = [
  {
    id: 1,
    languageCode: 'fre',
    selected: false,
    streamType: 2,
  },
]

export const mockNonAudioStreams: PlexMediaStream[] = [
  {
    id: 1,
    languageCode: 'eng',
    selected: false,
    streamType: 1, // video stream
  },
  {
    id: 2,
    languageCode: 'eng',
    selected: false,
    streamType: 3, // subtitle stream
  },
]
