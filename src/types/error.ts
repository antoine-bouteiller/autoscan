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

/**
 * Recursively consume valid identifier characters to extract a variable name.
 * Returns [extractedVar, remainingString] as a tuple encoded in an object.
 */
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

type PropsWithCause<Msg extends string> = VarProps<Msg> & { cause?: unknown }
type VarProps<Msg extends string> = [ExtractVars<Msg>] extends [never] ? Record<never, never> : Record<ExtractVars<Msg>, string | number>

export type TaggedErrorInstance<Tag extends string, Msg extends string, Base extends Error = Error> = Base & {
  readonly _tag: Tag
  readonly message: string
  /** The original message template with $variable placeholders (e.g. 'User $id not found') */
  readonly messageTemplate: Msg
  /** Stable fingerprint for error grouping in Sentry/logging. Returns [_tag, messageTemplate]. */
  readonly fingerprint: readonly [Tag, Msg]
  toJSON(): object
  /** Walk the .cause chain to find an ancestor matching a specific error class. */
  findCause<T extends Error>(ErrorClass: new (...args: unknown[]) => T): T | undefined
} & Readonly<VarProps<Msg>>

export interface TaggedErrorClass<Tag extends string, Msg extends string, Base extends Error = Error> {
  new (...args: ExtractVars<Msg> extends never ? [args?: { cause?: unknown }] : [args: PropsWithCause<Msg>]): TaggedErrorInstance<Tag, Msg, Base>

  /** Type guard for this error class */
  is(value: unknown): value is TaggedErrorInstance<Tag, Msg, Base>

  /** The tag/name of this error class */
  readonly tag: Tag
}
