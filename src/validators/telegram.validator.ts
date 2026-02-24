import * as v from 'valibot'

const telegramUserSchema = v.object({
  id: v.number(),
  is_bot: v.boolean(),
})

const telegramChatSchema = v.object({
  id: v.number(),
})

const telegramMessageInSchema = v.object({
  message_id: v.number(),
  chat: telegramChatSchema,
  text: v.optional(v.string()),
  from: v.optional(telegramUserSchema),
})

const telegramCallbackQuerySchema = v.object({
  id: v.string(),
  data: v.optional(v.string()),
  message: v.optional(telegramMessageInSchema),
})

export const telegramUpdateSchema = v.object({
  update_id: v.number(),
  message: v.optional(telegramMessageInSchema),
  callback_query: v.optional(telegramCallbackQuerySchema),
})

const telegramMessageSchema = v.object({
  message_id: v.number(),
  chat: telegramChatSchema,
})

export const getUpdatesResponseSchema = v.object({
  ok: v.literal(true),
  result: v.array(telegramUpdateSchema),
})

export const sendMessageResponseSchema = v.object({
  ok: v.literal(true),
  result: telegramMessageSchema,
})

export type TelegramUpdate = v.InferOutput<typeof telegramUpdateSchema>
export type TelegramCallbackQuery = v.InferOutput<typeof telegramCallbackQuerySchema>
export type TelegramMessageIn = v.InferOutput<typeof telegramMessageInSchema>
