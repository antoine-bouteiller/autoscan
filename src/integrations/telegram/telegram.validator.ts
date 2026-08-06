import { Schema } from 'effect'

const telegramUserSchema = Schema.Struct({
  id: Schema.Finite,
  is_bot: Schema.Boolean,
})

const telegramChatSchema = Schema.Struct({
  id: Schema.Finite,
})

const telegramMessageInSchema = Schema.Struct({
  chat: telegramChatSchema,
  from: Schema.optional(telegramUserSchema),
  message_id: Schema.Finite,
  text: Schema.optional(Schema.String),
})

const telegramCallbackQuerySchema = Schema.Struct({
  data: Schema.optional(Schema.String),
  id: Schema.String,
  message: Schema.optional(telegramMessageInSchema),
})

const telegramUpdateSchema = Schema.Struct({
  callback_query: Schema.optional(telegramCallbackQuerySchema),
  message: Schema.optional(telegramMessageInSchema),
  update_id: Schema.Finite,
})

const telegramMessageSchema = Schema.Struct({
  chat: telegramChatSchema,
  message_id: Schema.Finite,
})

export const getUpdatesResponseSchema = Schema.Struct({
  ok: Schema.Literal(true),
  result: Schema.Array(telegramUpdateSchema).pipe(Schema.mutable),
})

export const sendMessageResponseSchema = Schema.Struct({
  ok: Schema.Literal(true),
  result: telegramMessageSchema,
})

export type TelegramUpdate = typeof telegramUpdateSchema.Type
export type TelegramCallbackQuery = typeof telegramCallbackQuerySchema.Type
export type TelegramMessageIn = typeof telegramMessageInSchema.Type
