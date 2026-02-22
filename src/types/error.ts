type Alpha =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z'
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q'
  | 'R'
  | 'S'
  | 'T'
  | 'U'
  | 'V'
  | 'W'
  | 'X'
  | 'Y'
  | 'Z'
  | '_'
type Digit = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
type AlphaNum = Alpha | Digit

type ConsumeVar<S extends string, Acc extends string = ''> = S extends `${infer C}${infer Rest}`
  ? C extends AlphaNum
    ? ConsumeVar<Rest, `${Acc}${C}`>
    : { var: Acc; rest: S }
  : { var: Acc; rest: '' }

type ExtractVars<S extends string> = S extends `${string}$${infer AfterDollar}`
  ? AfterDollar extends `${Alpha}${string}`
    ? ConsumeVar<AfterDollar> extends { var: infer V extends string; rest: infer R extends string }
      ? V extends ''
        ? ExtractVars<R>
        : V | ExtractVars<R>
      : never
    : ExtractVars<AfterDollar>
  : never

type VarProps<Msg extends string> = [ExtractVars<Msg>] extends [never] ? Record<never, never> : Record<ExtractVars<Msg>, string | number>

export type TaggedErrorInstance<Tag extends string, Msg extends string> = Error & {
  readonly _tag: Tag
  readonly tag: Tag
  readonly messageTemplate: Msg
} & Readonly<VarProps<Msg>>

export type TaggedErrorClass<Tag extends string, Msg extends string> = new (
  ...args: [ExtractVars<Msg>] extends [never] ? [args?: { cause?: unknown }] : [args: VarProps<Msg> & { cause?: unknown }]
) => TaggedErrorInstance<Tag, Msg>
