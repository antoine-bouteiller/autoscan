import * as v from 'valibot'

export const sendMessageValidator = v.object({
  text: v.string(),
})
