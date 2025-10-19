export type MediaType = 'movie' | 'show'

export interface PlexMedia {
  grandparentTitle?: string
  key: string
  librarySectionID: number
  Media: {
    Part: {
      file: string
      id: number
      Stream: PlexMediaStream[]
    }[]
  }[]
  parentTitle?: string
  primaryExtraKey: string
  ratingKey: string
  title: string
  type: 'episode' | 'movie'
  year: number
}

export interface PlexMediaStream {
  id: number
  languageCode: string
  selected: boolean
  streamType: number
  title?: string
}

export interface PlexReponse {
  MediaContainer: {
    Directory: {
      key: number
      title: string
      type: MediaType
    }[]
    Metadata: PlexMedia[]
  }
}
