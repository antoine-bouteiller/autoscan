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

type ConsumeVar<Str extends string, Acc extends string = ''> = Str extends `${infer Char}${infer Rest}`
  ? Char extends AlphaNum
    ? ConsumeVar<Rest, `${Acc}${Char}`>
    : { var: Acc; rest: Str }
  : { var: Acc; rest: '' }

type ExtractVars<Str extends string> = Str extends `${string}$${infer AfterDollar}`
  ? AfterDollar extends `${Alpha}${string}`
    ? ConsumeVar<AfterDollar> extends { var: infer VarName extends string; rest: infer Remaining extends string }
      ? VarName extends ''
        ? ExtractVars<Remaining>
        : VarName | ExtractVars<Remaining>
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
