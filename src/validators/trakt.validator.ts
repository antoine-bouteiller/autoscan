import * as v from 'valibot'

export const deviceCodeResponseValidator = v.object({
  device_code: v.string(),
  expires_in: v.number(),
  interval: v.number(),
  user_code: v.string(),
  verification_url: v.string(),
})

export const tokenResponseValidator = v.object({
  access_token: v.string(),
  created_at: v.number(),
  expires_in: v.number(),
  refresh_token: v.string(),
  scope: v.string(),
  token_type: v.string(),
})

export const syncResponseValidator = v.object({
  added: v.object({
    episodes: v.number(),
    movies: v.number(),
  }),
  not_found: v.object({
    episodes: v.array(v.unknown()),
    movies: v.array(v.unknown()),
    seasons: v.array(v.unknown()),
    shows: v.array(v.unknown()),
  }),
})

export type TraktDeviceCodeResponse = v.InferOutput<typeof deviceCodeResponseValidator>
export type TraktTokenResponse = v.InferOutput<typeof tokenResponseValidator>
export type TraktSyncResponse = v.InferOutput<typeof syncResponseValidator>
