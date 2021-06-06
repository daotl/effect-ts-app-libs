/* eslint-disable @typescript-eslint/ban-types */
// tracing: off

import * as Chunk from "@effect-ts/core/Collections/Immutable/Chunk"
import type { Dictionary } from "@effect-ts/core/Collections/Immutable/Dictionary"
import { pipe } from "@effect-ts/core/Function"
import * as MO from "@effect-ts/schema"
import { augmentRecord } from "@effect-ts/schema/_utils"
import * as Arbitrary from "@effect-ts/schema/Arbitrary"
import * as Encoder from "@effect-ts/schema/Encoder"
import * as Guard from "@effect-ts/schema/Guard"
import * as Parser from "@effect-ts/schema/Parser"
import * as Th from "@effect-ts/schema/These"

export const dictionaryIdentifier = MO.makeAnnotation<{}>()

export type ParserErrorFromDictionary = MO.CompositionE<
  MO.PrevE<MO.LeafE<MO.UnknownRecordE>> | MO.NextE<MO.LeafE<MO.ParseObjectE>>
> // TODO

export function dictionary<
  ParserInput,
  ParserError extends MO.AnyError,
  ParsedShape,
  ConstructorInput,
  ConstructorError extends MO.AnyError,
  Encoded,
  Api
>(
  self: MO.Schema<
    ParserInput,
    ParserError,
    ParsedShape,
    ConstructorInput,
    ConstructorError,
    Encoded,
    Api
  >
): MO.DefaultSchema<
  unknown,
  ParserErrorFromDictionary,
  Dictionary<ParsedShape>,
  Dictionary<ParsedShape>,
  never,
  Dictionary<Encoded>,
  {}
> {
  const guard = Guard.for(self)
  const arb = Arbitrary.for(self)
  const parse = Parser.for(self)
  const encode = Encoder.for(self)

  function parser(
    _: unknown
  ): Th.These<ParserErrorFromDictionary, Dictionary<ParsedShape>> {
    if (typeof _ !== "object" || _ === null) {
      return Th.fail(
        MO.compositionE(Chunk.single(MO.prevE(MO.leafE(MO.unknownRecordE(_)))))
      )
    }
    let errors =
      Chunk.empty<MO.OptionalKeyE<string, unknown> | MO.RequiredKeyE<string, unknown>>()

    let isError = false

    const result = {}

    const keys = Object.keys(_)

    for (const key of keys) {
      const res = parse(_[key])

      if (res.effect._tag === "Left") {
        errors = Chunk.append_(errors, MO.requiredKeyE(key, res.effect.left))
        isError = true
      } else {
        result[key] = res.effect.right.get(0)

        const warnings = res.effect.right.get(1)

        if (warnings._tag === "Some") {
          errors = Chunk.append_(errors, MO.requiredKeyE(key, warnings.value))
        }
      }
    }

    if (!isError) {
      augmentRecord(result)
    }

    if (Chunk.isEmpty(errors)) {
      return Th.succeed(result as Dictionary<ParsedShape>)
    }

    const error_ = MO.compositionE(Chunk.single(MO.nextE(MO.structE(errors))))
    const error = error_

    if (isError) {
      // @ts-expect-error doc
      return Th.fail(error)
    }

    // @ts-expect-error doc
    return Th.warn(result, error)
  }

  const refine = (u: unknown): u is Dictionary<ParsedShape> =>
    typeof u === "object" &&
    u != null &&
    !Object.keys(u).every((x) => typeof x === "string" && Object.values(u).every(guard))

  return pipe(
    MO.refinement(refine, (v) => MO.leafE(MO.parseObjectE(v))),
    MO.constructor((s: Dictionary<ParsedShape>) => Th.succeed(s)),
    MO.arbitrary((_) => _.dictionary<ParsedShape>(_.string(), arb(_))),
    MO.parser(parser),
    MO.encoder((_) =>
      Object.keys(_).reduce((prev, cur) => {
        prev[cur] = encode(_[cur])
        return prev
      }, {} as Record<string, Encoded>)
    ),
    MO.mapApi(() => ({})),
    MO.withDefaults,
    MO.annotate(dictionaryIdentifier, {})
  )
}
