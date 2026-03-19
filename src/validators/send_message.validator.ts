import { z } from 'zod'

export const sendMessageValidator = z.object({
  text: z.string(),
})
