// oxlint-disable-next-line no-unsafe-type-assertion
export const typedKeyOf = <Obj extends object>(obj: Obj) => Object.keys(obj) as (keyof Obj)[]

export const typedEntriesOf = <Obj extends object>(obj: Obj) =>
  // oxlint-disable-next-line no-unsafe-type-assertion
  Object.entries(obj) as [keyof Obj, Obj[keyof Obj]][]

export const inversedEntriesOf = <Obj extends Record<string, number | string | symbol>>(obj: Obj) => {
  const entries = Object.entries(obj).map(([key, value]) => [value, key] as const)
  // oxlint-disable-next-line no-unsafe-type-assertion
  return Object.fromEntries(entries) as {
    [Key in keyof Obj as Obj[Key]]: Key
  }
}
