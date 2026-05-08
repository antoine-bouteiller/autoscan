import { z } from 'zod'

const telegramUserSchema = z.object({
  id: z.number(),
  is_bot: z.boolean(),
})

const telegramChatSchema = z.object({
  id: z.number(),
})

const telegramMessageInSchema = z.object({
  chat: telegramChatSchema,
  from: telegramUserSchema.optional(),
  message_id: z.number(),
  text: z.string().optional(),
})

const telegramCallbackQuerySchema = z.object({
  data: z.string().optional(),
  id: z.string(),
  message: telegramMessageInSchema.optional(),
})

const telegramUpdateSchema = z.object({
  callback_query: telegramCallbackQuerySchema.optional(),
  message: telegramMessageInSchema.optional(),
  update_id: z.number(),
})

const telegramMessageSchema = z.object({
  chat: telegramChatSchema,
  message_id: z.number(),
})

export const getUpdatesResponseSchema = z.object({
  ok: z.literal(true),
  result: z.array(telegramUpdateSchema),
})

export const sendMessageResponseSchema = z.object({
  ok: z.literal(true),
  result: telegramMessageSchema,
})

export type TelegramUpdate = z.infer<typeof telegramUpdateSchema>
export type TelegramCallbackQuery = z.infer<typeof telegramCallbackQuerySchema>
export type TelegramMessageIn = z.infer<typeof telegramMessageInSchema>
