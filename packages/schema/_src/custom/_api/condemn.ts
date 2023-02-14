// tracing: off

import { Case } from "@effect-app/core/Case"

import type { AnyError } from "../_schema.js"
import { drawError } from "../_schema.js"
import type { Parser, ParserEnv } from "../Parser.js"

/**
 * The Effect fails with the generic `E` type when the parser produces an invalid result
 * Otherwise success with the valid result.
 */
export function condemn<X, E, A>(
  self: Parser<X, E, A>
): (a: X, env?: ParserEnv) => Effect<never, E, A> {
  return (x, env?: ParserEnv) =>
    Effect.suspendSucceed(() => {
      const y = self(x, env).effect
      if (y._tag === "Left") {
        return Effect.fail(y.left)
      }
      const [a, w] = y.right
      return w._tag === "Some" ? Effect.fail(w.value) : Effect(a)
    })
}

export class CondemnException extends Case<{ readonly message: string }> {
  readonly _tag = "CondemnException"

  override toString() {
    return this.message
  }
}

export class ThrowableCondemnException extends Error {
  readonly _tag = "CondemnException"
}

/**
 * The Effect fails with `ThrowableCondemnException` when the parser produces an invalid result.
 * Otherwise succeeds with the valid result.
 */
export const condemnFailWithStringify =
  <E>(stringify: (e: E) => string) => <X, A>(self: Parser<X, E, A>) => (a: X, env?: ParserEnv) =>
    Effect.suspendSucceed(() => {
      const res = self(a, env).effect
      if (res._tag === "Left") {
        return Effect.fail(new CondemnException({ message: stringify(res.left) }))
      }
      const warn = res.right[1]
      if (warn._tag === "Some") {
        return Effect.fail(new CondemnException({ message: stringify(warn.value) }))
      }
      return Effect(res.right[0])
    })

/*
 * for `ets/Schema/Schema`, see `condemnFailWithStringify`
 */
export const condemnFail = condemnFailWithStringify<AnyError>(drawError)

/**
 * The Effect dies with `ThrowableCondemnException` when the parser produces an invalid result.
 * Otherwise succeeds with the valid result.
 */
export const condemnDieWithStringify = <E>(stringify: (e: E) => string) => <X, A>(self: Parser<X, E, A>) => {
  const orFail = condemnFailWithStringify(stringify)(self)
  return (a: X, env?: ParserEnv) => orFail(a, env).orDie
}

/*
 * for `ets/Schema/Schema`, see `condemnDieWithStringify`
 */
export const condemnDie = condemnDieWithStringify<AnyError>(drawError)

/**
 * Throws a classic `ThrowableCondemnException` when the parser produces an invalid result.
 * Otherwise returns the valid result.
 */
export const unsafeWithStringify =
  <E>(stringify: (e: E) => string) => <X, A>(self: Parser<X, E, A>) => (a: X, env?: ParserEnv) => {
    const res = self(a, env).effect
    if (res._tag === "Left") {
      throw new ThrowableCondemnException(stringify(res.left))
    }
    const warn = res.right[1]
    if (warn._tag === "Some") {
      throw new ThrowableCondemnException(stringify(warn.value))
    }
    return res.right[0]
  }

/*
 * for `ets/Schema/Schema`, see `unsafeWithStringify`
 */
export const unsafe = unsafeWithStringify<AnyError>(drawError)
