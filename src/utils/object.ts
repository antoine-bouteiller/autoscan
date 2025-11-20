export const isKeyOf = <T extends object>(obj: T, value: unknown): value is keyof T =>
  typeof value === 'string' && value in obj

export const typedKeyOf = <T extends object>(obj: T) => Object.keys(obj) as (keyof T)[]

export const typedEntriesOf = <T extends object>(obj: T) =>
  Object.entries(obj) as [keyof T, T[keyof T]][]
