import { z } from 'zod'

export const deviceCodeResponseValidator = z.object({
  device_code: z.string(),
  expires_in: z.number(),
  interval: z.number(),
  user_code: z.string(),
  verification_url: z.string(),
})

export const tokenResponseValidator = z.object({
  access_token: z.string(),
  created_at: z.number(),
  expires_in: z.number(),
  refresh_token: z.string(),
  scope: z.string(),
  token_type: z.string(),
})

export const syncResponseValidator = z.object({
  added: z.object({
    episodes: z.number(),
    movies: z.number(),
  }),
  not_found: z.object({
    episodes: z.array(z.unknown()),
    movies: z.array(z.unknown()),
    seasons: z.array(z.unknown()),
    shows: z.array(z.unknown()),
  }),
})

export type TraktDeviceCodeResponse = z.infer<typeof deviceCodeResponseValidator>
export type TraktTokenResponse = z.infer<typeof tokenResponseValidator>
export type TraktSyncResponse = z.infer<typeof syncResponseValidator>
