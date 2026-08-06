import { Schema } from 'effect'

export const sendMessageValidator = Schema.Struct({
  text: Schema.String,
})
