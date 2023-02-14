import type fastify from "fastify"

export const trySend = (fn: () => fastify.FastifyReply) =>
  Effect.async<unknown, never, unknown>((cb: (_: Effect<unknown, never, unknown>) => void) =>
    fn().then(() => cb(Effect.unit), () => cb(Effect.unit))
  )
