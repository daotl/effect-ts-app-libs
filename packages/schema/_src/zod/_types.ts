import type { ZodSchema, ZodTypeDef } from "zod"

export type Schema<ParsedShape, ParserInput> = ZodSchema<ParsedShape, ZodTypeDef, ParserInput>
