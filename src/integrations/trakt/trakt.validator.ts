import { Schema } from 'effect'

export const deviceCodeResponseValidator = Schema.Struct({
  device_code: Schema.String,
  expires_in: Schema.Finite,
  interval: Schema.Finite,
  user_code: Schema.String,
  verification_url: Schema.String,
})

export const tokenResponseValidator = Schema.Struct({
  access_token: Schema.String,
  created_at: Schema.Finite,
  expires_in: Schema.Finite,
  refresh_token: Schema.String,
  scope: Schema.String,
  token_type: Schema.String,
})

export const syncResponseValidator = Schema.Struct({
  added: Schema.Struct({
    episodes: Schema.Finite,
    movies: Schema.Finite,
  }),
  not_found: Schema.Struct({
    episodes: Schema.Array(Schema.Unknown),
    movies: Schema.Array(Schema.Unknown),
    seasons: Schema.Array(Schema.Unknown),
    shows: Schema.Array(Schema.Unknown),
  }),
})

export type TraktDeviceCodeResponse = typeof deviceCodeResponseValidator.Type
export type TraktTokenResponse = typeof tokenResponseValidator.Type
export type TraktSyncResponse = typeof syncResponseValidator.Type
