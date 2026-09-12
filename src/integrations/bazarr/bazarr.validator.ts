import { Effect, Schema, SchemaGetter, SchemaIssue } from 'effect'

import { ISO1 } from '@/shared/types/iso_codes'
import { normalizeToIso1 } from '@/shared/utils/iso_codes'

const isoCodeValidator = Schema.String.pipe(
  Schema.decodeTo(Schema.Literals(ISO1), {
    decode: SchemaGetter.transformOrFail((code) => {
      const normalized = normalizeToIso1(code)
      return normalized === undefined
        ? Effect.fail(new SchemaIssue.InvalidValue({ message: `Unknown ISO language code: ${code}` }))
        : Effect.succeed(normalized)
    }),
    encode: SchemaGetter.transform((code) => code),
  })
)

const subtitleValidator = Schema.Struct({
  code2: isoCodeValidator,
  forced: Schema.Boolean,
  hi: Schema.Boolean,
  path: Schema.NullOr(Schema.String),
})

const missingSubtitleValidator = Schema.Struct({
  code2: isoCodeValidator,
  forced: Schema.Boolean,
  hi: Schema.Boolean,
})

export const movieValidator = Schema.Struct({
  missing_subtitles: Schema.Array(missingSubtitleValidator),
  path: Schema.String,
  radarrId: Schema.Int,
  subtitles: Schema.Array(subtitleValidator),
  title: Schema.String,
})

export const episodeValidator = Schema.Struct({
  missing_subtitles: Schema.Array(missingSubtitleValidator),
  path: Schema.String,
  sonarrEpisodeId: Schema.Int,
  sonarrSeriesId: Schema.Int,
  subtitles: Schema.Array(subtitleValidator),
  title: Schema.String,
})

export const moviesResponseValidator = Schema.Struct({ data: Schema.Array(movieValidator), total: Schema.Int })
export const episodesResponseValidator = Schema.Struct({ data: Schema.Array(episodeValidator) })
export const lookupMoviesResponseValidator = Schema.Struct({ data: Schema.Array(Schema.Unknown), total: Schema.Int })
export const lookupEpisodesResponseValidator = Schema.Struct({ data: Schema.Array(Schema.Unknown) })
export const wantedMoviesResponseValidator = Schema.Struct({
  data: Schema.Array(Schema.Struct({ missing_subtitles: Schema.Array(missingSubtitleValidator), radarrId: Schema.Int })),
  total: Schema.Int,
})
export const wantedEpisodesResponseValidator = Schema.Struct({
  data: Schema.Array(
    Schema.Struct({ missing_subtitles: Schema.Array(missingSubtitleValidator), sonarrEpisodeId: Schema.Int, sonarrSeriesId: Schema.Int })
  ),
  total: Schema.Int,
})
export const seriesResponseValidator = Schema.Struct({ data: Schema.Array(Schema.Struct({ path: Schema.String, sonarrSeriesId: Schema.Int })) })
export const profilesValidator = Schema.Array(Schema.Struct({ name: Schema.String, profileId: Schema.Int }))

export type BazarrMovieRow = typeof movieValidator.Type
export type BazarrEpisodeRow = typeof episodeValidator.Type
export type BazarrMissingSubtitle = typeof missingSubtitleValidator.Type
