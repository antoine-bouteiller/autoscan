import { type AppReply } from '#providers/http/types'

interface ApiResponse<Data> {
  data?: Data
  error?: { code: string; details?: unknown; message: string }
  meta?: { timestamp: string }
  success: boolean
}

const sendResponse = <Data>(reply: AppReply, body: ApiResponse<Data>, status: number) =>
  reply.status(status).send({
    ...body,
    meta: { timestamp: new Date().toISOString() },
  })

export const success = <Data>(reply: AppReply, data: Data, status = 200) => sendResponse(reply, { data, success: true }, status)

export const badRequest = (reply: AppReply, message: string, details?: unknown) =>
  sendResponse(
    reply,
    {
      error: { code: 'BAD_REQUEST', details, message },
      success: false,
    },
    400
  )
