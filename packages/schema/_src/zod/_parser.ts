import * as These from "_src/custom/These.js"
import type { ZodError, ZodSchema, ZodTypeDef } from "zod"
import type * as P from "../custom/Parser.js"

const cache = new WeakMap()

export const parserFor = function<ParserInput, Def extends ZodTypeDef, ParsedShape>(
  schema: ZodSchema<ParsedShape, Def, ParserInput>
) {
  if (cache.has(schema)) {
    return cache.get(schema) as P.Parser<ParserInput, ZodError<ParserInput>, ParsedShape>
  }
  const parser = (u: ParserInput, _env?: P.ParserEnv) => {
    const ret = schema.safeParse(u)
    return ret.success ? These.succeed(ret.data) : These.fail(ret.error)
  }
  cache.set(schema, parser)
  return parser
}
