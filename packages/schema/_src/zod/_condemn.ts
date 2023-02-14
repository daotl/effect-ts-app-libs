// tracing: off

import { condemnDieWithStringify, condemnFailWithStringify, unsafeWithStringify } from "_src/custom.js"
import typia from "typia"
import type { ZodError } from "zod"

function errToMsg(error: ZodError) {
  return typia.stringify(error.issues)
}

/**
 * The Effect fails with `ThrowableCondemnException` when the parser produces an invalid result.
 * Otherwise succeeds with the valid result.
 */
export const condemnFail = condemnFailWithStringify<ZodError>(errToMsg)

/**
 * The Effect dies with `ThrowableCondemnException` when the parser produces an invalid result.
 * Otherwise succeeds with the valid result.
 */
export const condemnDie = condemnDieWithStringify<ZodError>(errToMsg)

/**
 * Throws a classic `ThrowableCondemnException` when the parser produces an invalid result.
 * Otherwise returns the valid result.
 */
export const unsafe = unsafeWithStringify<ZodError>(errToMsg)
