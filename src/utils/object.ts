export const isKeyOf = <T extends object>(obj: T, value: unknown): value is keyof T => typeof value === 'string' && value in obj

export const isValueOf = <T extends object>(obj: T, value: unknown): value is T[keyof T] => Object.values(obj).includes(value)

// oxlint-disable-next-line no-unsafe-type-assertion
export const typedKeyOf = <T extends object>(obj: T) => Object.keys(obj) as (keyof T)[]

export const typedEntriesOf = <T extends object>(obj: T) =>
  // oxlint-disable-next-line no-unsafe-type-assertion
  Object.entries(obj) as [keyof T, T[keyof T]][]

export const inversedEntriesOf = <T extends Record<string, number | string | symbol>>(obj: T) => {
  const entries = Object.entries(obj).map(([key, value]) => [value, key] as const)
  // oxlint-disable-next-line no-unsafe-type-assertion
  return Object.fromEntries(entries) as {
    [K in keyof T as T[K]]: K
  }
}
