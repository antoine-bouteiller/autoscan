import type { ArkErrors } from 'arktype'

import { AppError } from './base'

export class ValidationError extends AppError {
  constructor(public readonly errors: ArkErrors) {
    super(`Validation error: ${errors.summary}`, 400, 'VALIDATION_ERROR')
  }
}
