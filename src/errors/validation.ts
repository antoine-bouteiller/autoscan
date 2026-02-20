import type { BaseIssue } from 'valibot'
import * as v from 'valibot'

import { AppError } from './base'

export class ValidationError extends AppError {
  constructor(issues: [BaseIssue<unknown>, ...BaseIssue<unknown>[]]) {
    super(`Validation error: ${JSON.stringify(v.flatten(issues))}`, 400, 'VALIDATION_ERROR')
  }
}
