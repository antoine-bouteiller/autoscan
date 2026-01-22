import { ApiError } from '@/errors'

interface ErrorResponse {
  errors: {
    code: 'number'
    message: 'string'
  }[]
  success: 'boolean'
}

export const formatCloudflareError = (body: ErrorResponse) => body.errors.map((e) => e.message).join(', ')

export const isCloudflareApiError = (error: unknown): error is ApiError<ErrorResponse> =>
  error instanceof ApiError && typeof error.context.body === 'object' && error.context.body !== null && 'errors' in error.context.body
