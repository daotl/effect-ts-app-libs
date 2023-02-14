import type fastify from "fastify"
import type {
  InvalidStateError,
  NotFoundError,
  NotLoggedInError,
  OptimisticConcurrencyException,
  UnauthorizedError,
  ValidationError
} from "../../errors.js"
import type { RequestContext } from "../../RequestContext.js"
import { logRequestError } from "../reportError.js"
import { trySend } from "./utils.js"

export function defaultBasicErrorHandler<R>(
  _req: fastify.FastifyRequest,
  reply: fastify.FastifyReply,
  _requestContext: RequestContext,
  r2: Effect<R, ValidationError, void>
) {
  return Debug.untraced(() =>
    r2
      .tapErrorCause(cause => cause.isFailure() ? logRequestError(cause) : Effect.unit)
      .catchTag(
        "ValidationError",
        err => trySend(() => reply.code(400).send(err.errors))
      )
      // final catch all; expecting never so that unhandled known errors will show up
      .catchAll((err: never) =>
        Effect.logError(
          "Program error, compiler probably silenced, got an unsupported Error in Error Channel of Effect" + err
        )
          .map(() => err as unknown)
          .flatMap(Effect.die)
      )
  )
}

const optimisticConcurrencySchedule = Schedule.once() &&
  Schedule.recurWhile<SupportedErrors>(a => a._tag === "OptimisticConcurrencyException")

export function defaultErrorHandler<R>(
  req: fastify.FastifyRequest,
  reply: fastify.FastifyReply,
  _: RequestContext,
  r2: Effect<R, SupportedErrors, void>
) {
  const r3 = req.method === "PATCH"
    ? r2.retry(optimisticConcurrencySchedule)
    : r2
  return Debug.untraced(() =>
    r3
      .tapErrorCause(cause => cause.isFailure() ? logRequestError(cause) : Effect.unit)
      .catchTag("ValidationError", err => trySend(() => reply.code(400).send(err.errors)))
      .catchTag("NotFoundError", err => trySend(() => reply.code(404).send(err)))
      .catchTag("NotLoggedInError", err => trySend(() => reply.code(401).send(err)))
      .catchTag("UnauthorizedError", err => trySend(() => reply.code(403).send(err)))
      .catchTag("InvalidStateError", err => trySend(() => reply.code(422).send(err)))
      // 412 or 409.. https://stackoverflow.com/questions/19122088/which-http-status-code-to-use-to-reject-a-put-due-to-optimistic-locking-failure
      .catchTag("OptimisticConcurrencyException", err => trySend(() => reply.code(412).send(err)))
      // final catch all; expecting never so that unhandled known errors will show up
      .catchAll((err: never) =>
        Effect.logError(
          "Program error, compiler probably silenced, got an unsupported Error in Error Channel of Effect" + err
        )
          .map(() => err as unknown)
          .flatMap(Effect.die)
      )
  )
}

export type SupportedErrors =
  | ValidationError
  | NotFoundError
  | NotLoggedInError
  | UnauthorizedError
  | InvalidStateError
  | OptimisticConcurrencyException
