export const isInArray = <ArrayValue extends readonly unknown[]>(array: ArrayValue, value: unknown): value is ArrayValue[number] =>
  array.includes(value as ArrayValue[number])
