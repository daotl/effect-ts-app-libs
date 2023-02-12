// tracing: off

import { Case } from "@effect-app/core/Case"

import typia from "typia"
import type { E } from "vitest/dist/types-aac763a5.js"
import type { ZodError } from "zod"
import type { Effectify, Parser, ParserEnv } from "../custom/Parser.js"

/**
 * The Effect fails with the generic `E` type when the parser produces an invalid result
 * Otherwise success with the valid result.
 */
export const condemn = function<X, E, A>(
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
} satisfies Effectify<E>

export class CondemnException extends Case<{ readonly message: string }> {
  readonly _tag = "CondemnException"

  override toString() {
    return this.message
  }
}

function errToMsg(error: ZodError) {
  return typia.stringify(error.issues)
}

export class ThrowableCondemnException extends Error {
  readonly _tag = "CondemnException"

  constructor(readonly error: ZodError) {
    super(errToMsg(error))
  }
}

/**
 * The Effect fails with `ThrowableCondemnException` when the parser produces an invalid result.
 * Otherwise succeeds with the valid result.
 */
export const condemnFail = function<X, A>(self: Parser<X, ZodError, A>) {
  return (a: X, env?: ParserEnv) =>
    Effect.suspendSucceed(() => {
      const res = self(a, env).effect
      if (res._tag === "Left") {
        return Effect.fail(new CondemnException({ message: errToMsg(res.left) }))
      }
      const warn = res.right[1]
      if (warn._tag === "Some") {
        return Effect.fail(new CondemnException({ message: errToMsg(warn.value) }))
      }
      return Effect(res.right[0])
    })
} satisfies Effectify<ZodError, CondemnException>

/**
 * The Effect dies with `ThrowableCondemnException` when the parser produces an invalid result.
 * Otherwise succeeds with the valid result.
 */
export const condemnDie = function<X, A>(self: Parser<X, ZodError, A>) {
  const orFail = condemnFail(self)
  return (a: X, env?: ParserEnv) => orFail(a, env).orDie
} satisfies Effectify<ZodError, never>

/**
 * Throws a classic `ThrowableCondemnException` when the parser produces an invalid result.
 * Otherwise returns the valid result.
 */
export function unsafe<X, A>(self: Parser<X, ZodError, A>) {
  return (a: X, env?: ParserEnv) => {
    const res = self(a, env).effect
    if (res._tag === "Left") {
      throw new ThrowableCondemnException(res.left)
    }
    const warn = res.right[1]
    if (warn._tag === "Some") {
      throw new ThrowableCondemnException(warn.value)
    }
    return res.right[0]
  }
}
