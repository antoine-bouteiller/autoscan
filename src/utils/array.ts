export const isInArray = <T extends readonly unknown[]>(
  array: T,
  value: unknown
): value is T[number] => array.includes(value as T[number])
