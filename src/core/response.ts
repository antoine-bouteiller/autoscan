import type { FastifyReply } from 'fastify'

interface ApiResponse<Data> {
  data?: Data
  error?: { code: string; details?: unknown; message: string }
  meta?: { timestamp: string }
  success: boolean
}

const sendResponse = <Data>(reply: FastifyReply, body: ApiResponse<Data>, status: number) =>
  reply.status(status).send({
    ...body,
    meta: { timestamp: new Date().toISOString() },
  })

export const success = <Data>(reply: FastifyReply, data: Data, status = 200) => sendResponse(reply, { data, success: true }, status)

export const badRequest = (reply: FastifyReply, message: string, details?: unknown) =>
  sendResponse(
    reply,
    {
      error: { code: 'BAD_REQUEST', details, message },
      success: false,
    },
    400
  )
