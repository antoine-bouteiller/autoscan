import type { FastifyReply } from 'fastify'

interface ApiResponse<T> {
  data?: T
  error?: { code: string; details?: unknown; message: string }
  meta?: { timestamp: string }
  success: boolean
}

const sendResponse = <T>(reply: FastifyReply, body: ApiResponse<T>, status: number) =>
  reply.status(status).send({
    ...body,
    meta: { timestamp: new Date().toISOString() },
  })

export const success = <T>(reply: FastifyReply, data: T, status = 200) => sendResponse(reply, { data, success: true }, status)

export const badRequest = (reply: FastifyReply, message: string, details?: unknown) =>
  sendResponse(
    reply,
    {
      error: { code: 'BAD_REQUEST', details, message },
      success: false,
    },
    400
  )
