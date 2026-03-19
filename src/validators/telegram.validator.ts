import { z } from 'zod'

const telegramUserSchema = z.object({
  id: z.number(),
  is_bot: z.boolean(),
})

const telegramChatSchema = z.object({
  id: z.number(),
})

const telegramMessageInSchema = z.object({
  message_id: z.number(),
  chat: telegramChatSchema,
  text: z.string().optional(),
  from: telegramUserSchema.optional(),
})

const telegramCallbackQuerySchema = z.object({
  id: z.string(),
  data: z.string().optional(),
  message: telegramMessageInSchema.optional(),
})

export const telegramUpdateSchema = z.object({
  update_id: z.number(),
  message: telegramMessageInSchema.optional(),
  callback_query: telegramCallbackQuerySchema.optional(),
})

const telegramMessageSchema = z.object({
  message_id: z.number(),
  chat: telegramChatSchema,
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
