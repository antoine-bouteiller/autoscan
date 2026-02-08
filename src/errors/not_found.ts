import { AppError } from './base'

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string | number) {
    super(`${resource}${id ? ` ${id}` : ''} not found`, 404, 'NOT_FOUND')
  }
}
