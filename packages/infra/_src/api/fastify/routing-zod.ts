/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Fa from "@effect-app/infra-adapters/fastify"
import type { _E, _R } from "@effect-app/prelude/_ext/misc"
import type { GetRequest, GetResponse } from "@effect-app/prelude/schema"
import { extractSchema } from "@effect-app/prelude/schema"
import * as MO from "@effect-app/prelude/schema"
import { pretty } from "@effect-app/prelude/utils"
import { Zod } from "@effect-app/schema"
import type fastify from "fastify"
import type { ValidationError } from "../../errors.js"
import { RequestContext, RequestId } from "../../RequestContext.js"
import { reportRequestError } from "../reportError.js"
import { snipString } from "../util.js"
import type { SupportedErrors } from "./defaultErrorHandler.js"
import { defaultBasicErrorHandler } from "./defaultErrorHandler.js"
import type { Encode, RequestHandler, RequestHandlerOptRes, RequestParsers } from "./schema-zod/requestHandler.js"
import { parseRequestParams } from "./schema-zod/requestHandler.js"
import type { RouteDescriptorAny } from "./schema-zod/routing.js"
import { makeRouteDescriptor } from "./schema-zod/routing.js"
import { trySend } from "./utils.js"

export const RequestSettings = FiberRef.unsafeMake({
  verbose: false
})

export function makeRequestParsers<
  R,
  PathA,
  CookieA,
  QueryA,
  BodyA,
  HeaderA,
  ResA,
  Errors
>(
  Request: RequestHandler<
    R,
    PathA,
    CookieA,
    QueryA,
    BodyA,
    HeaderA,
    ResA,
    Errors
  >["Request"]
): RequestParsers<PathA, CookieA, QueryA, BodyA, HeaderA> {
  const ph = Effect(
    Option.fromNullable(Request.Headers)
      .map(s => s)
      .map(Zod.parserFor)
      .map(Zod.condemnFail)
  )
  const parseHeaders = u => ph.flatMapOpt(d => d(u))

  const pq = Effect(
    Option.fromNullable(Request.Query)
      .map(s => s)
      .map(Zod.parserFor)
      .map(Zod.condemnFail)
  )
  const parseQuery = u => pq.flatMapOpt(d => d(u))

  const pb = Effect(
    Option.fromNullable(Request.Body)
      .map(s => s)
      .map(Zod.parserFor)
      .map(Zod.condemnFail)
  )
  const parseBody = u => pb.flatMapOpt(d => d(u))

  const pp = Effect(
    Option.fromNullable(Request.Path)
      .map(s => s)
      .map(Zod.parserFor)
      .map(Zod.condemnFail)
  )
  const parsePath = u => pp.flatMapOpt(d => d(u))

  const pc = Effect(
    Option.fromNullable(Request.Cookie)
      .map(s => s)
      .map(Zod.parserFor)
      .map(Zod.condemnFail)
  )
  const parseCookie = (u: unknown) => pc.flatMapOpt(d => d(u))

  return {
    parseBody,
    parseCookie,
    parseHeaders,
    parsePath,
    parseQuery
  }
}

export type MakeMiddlewareContext<ResE, R2 = never, PR = never> = (
  req: fastify.FastifyRequest,
  reply: fastify.FastifyReply,
  context: RequestContext
) => Effect<R2, ResE, Context<PR>>

export type Middleware<
  R,
  PathA,
  CookieA,
  QueryA,
  BodyA,
  HeaderA,
  ResA,
  ResE,
  R2 = never,
  PR = never
> = (
  handler: RequestHandler<R, PathA, CookieA, QueryA, BodyA, HeaderA, ResA, ResE>
) => {
  handler: typeof handler
  makeContext: MakeMiddlewareContext<ResE, R2, PR>
}

export function match<
  R,
  E,
  PathA,
  CookieA,
  QueryA,
  BodyA,
  HeaderA,
  ResA,
  R2 = never,
  PR = never,
  RErr = never
>(
  requestHandler: RequestHandler<
    R,
    PathA,
    CookieA,
    QueryA,
    BodyA,
    HeaderA,
    ResA,
    E
  >,
  errorHandler: <R>(
    req: fastify.FastifyRequest,
    reply: fastify.FastifyReply,
    requestContext: RequestContext,
    r2: Effect<R, E | ValidationError, void>
  ) => Effect<RErr, never, void>,
  middleware?: Middleware<
    R,
    PathA,
    CookieA,
    QueryA,
    BodyA,
    HeaderA,
    ResA,
    E,
    R2,
    PR
  >
) {
  let makeMiddlewareContext = undefined
  if (middleware) {
    const { handler, makeContext } = middleware(requestHandler)
    requestHandler = handler
    makeMiddlewareContext = makeContext
  }
  return Fa.match(requestHandler.Request.method.toLowerCase() as any)(
    requestHandler.Request.path.split("?")[0],
    makeRequestHandler<R, E, PathA, CookieA, QueryA, BodyA, HeaderA, ResA, R2, PR, RErr>(
      requestHandler,
      errorHandler,
      makeMiddlewareContext
    )
  ).zipRight(
    Effect(() =>
      makeRouteDescriptor(
        requestHandler.Request.path,
        requestHandler.Request.method,
        requestHandler
      )
    )
  )
}

export function respondSuccess<ReqA, A, E>(
  encodeResponse: (req: ReqA) => Encode<A, E>
) {
  return (req: ReqA, reply: fastify.FastifyReply, a: A) =>
    Effect(() => encodeResponse(req)(a))
      .flatMap(r =>
        trySend(() =>
          r === undefined
            ? reply.code(204).send()
            : reply.code(200)
              .send(JSON.stringify(r))
        )
      )
}

export function makeRequestHandler<
  R,
  E,
  PathA,
  CookieA,
  QueryA,
  BodyA,
  HeaderA,
  ResA = void,
  R2 = never,
  PR = never,
  RErr = never
>(
  handler: RequestHandlerOptRes<
    R | PR,
    PathA,
    CookieA,
    QueryA,
    BodyA,
    HeaderA,
    ResA,
    E
  >,
  errorHandler: <R>(
    req: fastify.FastifyRequest,
    reply: fastify.FastifyReply,
    requestContext: RequestContext,
    r2: Effect<R, E | ValidationError, void>
  ) => Effect<RErr | R, never, void>,
  makeMiddlewareContext?: MakeMiddlewareContext<E, R2, PR>
): (req: fastify.FastifyRequest, reply: fastify.FastifyReply) => Effect<RErr | R | R2, never, void> {
  const { Request, Response, adaptResponse, h: handle } = handler
  const response = Response ? extractSchema(Response) : Void
  const encoder = Encoder.for(response)
  const encodeResponse = adaptResponse
    ? (req: ReqA) => Encoder.for(adaptResponse(req))
    : () => encoder

  const requestParsers = makeRequestParsers(Request)
  const parseRequest = parseRequestParams(requestParsers)
  const respond = respondSuccess(encodeResponse)

  function getParams(req: fastify.FastifyRequest) {
    return Effect(() => ({
      path: req.params,
      query: req.query,
      body: req.body,
      headers: req.headers,
      cookies: req.cookies
    }))
  }

  function makeContext(req: fastify.FastifyRequest) {
    const start = new Date()
    const supported = ["en", "de"] as const
    const desiredLocale = req.headers["x-locale"]
    const locale = desiredLocale && supported.includes(desiredLocale as any)
      ? (desiredLocale as typeof supported[number])
      : ("en" as const)

    // const context = getAppInsightsContext()
    // if (!context) {
    //   throw new Error("AI Context missing")
    // }

    const requestId = req.headers["request-id"]
    const rootId = requestId ? RequestId.parseUnsafe(requestId) : RequestId.make()

    const requestContext = new RequestContext({
      rootId,
      name: ReasonableString(Request.name),
      locale,
      createdAt: start
      // ...(context.operation.parentId
      //   ? {
      //     parent: new RequestContextParent({
      //       id: RequestId(context.operation.parentId),
      //       locale,
      //       name: ReasonableString("API Request")
      //     })
      //   }
      //   : {})
    })
    // context.requestContext = requestContext
    return requestContext
  }

  // return
  const ret = (req: fastify.FastifyRequest, reply: fastify.FastifyReply) => {
    return Debug.untraced(restore =>
      Effect.struct({
        requestContext: Effect.sync(() => {
          const requestContext = makeContext(req)
          if (req.method === "GET") {
            void reply.header("Cache-Control", "no-store")
          }
          vodi reply.header("Content-Language", requestContext.locale)
          return requestContext
        }),
        pars: getParams(req)
      })
        .flatMap(({ pars, requestContext }) =>
          RequestSettings.get.flatMap(s =>
            Effect.logInfo("Incoming request").apply(
              Effect.logAnnotates({
                method: req.method,
                path: req.url,
                ...s.verbose
                  ? {
                    reqPath: pars.path.$$.pretty,
                    reqQuery: pars.query.$$.pretty,
                    reqBody: pretty(pars.body),
                    reqCookies: pretty(pars.cookies),
                    reqHeaders: pars.headers.$$.pretty
                  } :
                  undefined
              })
            )
          ).zipRight(
            Effect.suspendSucceed(() => {
              const handleRequest = parseRequest(req)
                .map(({ body, path, query }) => {
                  const hn = {
                    ...body.value,
                    ...query.value,
                    ...path.value
                  } as unknown as ReqA
                  return hn
                })
                .flatMap(parsedReq =>
                  restore(() => handle(parsedReq as any))()
                    .flatMap(r => respond(parsedReq, reply, r))
                )
              // Commands should not be interruptable.
              const r = req.method !== "GET" ? handleRequest.uninterruptible : handleRequest // .instrument("Performance.RequestResponse")
              // the first log entry should be of the request start.
              const r2 = makeMiddlewareContext
                ? r.provideSomeContextEffect(makeMiddlewareContext(req, reply, requestContext))
                // PR is not relevant here
                : r as Effect<R, E | ValidationError, void>
              return errorHandler(
                req,
                reply,
                requestContext,
                r2
              )
            })
          )
            .tapErrorCause(cause =>
              Effect.tuplePar(
                Effect(reply.status(500).send()),
                reportRequestError(cause, {
                  requestContext,
                  path: req.originalUrl,
                  method: req.method
                }),
                Effect.suspendSucceed(() => {
                  const headers = reply.getHeaders()
                  return Effect.logErrorCauseMessage(
                    "Finished request",
                    cause
                  ).apply(Effect.logAnnotates({
                    method: req.method,
                    path: req.originalUrl,
                    statusCode: reply.statusCode.toString(),

                    reqPath: pars.path.$$.pretty,
                    reqQuery: pars.query.$$.pretty,
                    reqBody: pretty(pars.body),
                    reqCookies: pretty(pars.cookies),
                    reqHeaders: pars.headers.$$.pretty,

                    resHeaders: Object.entries(headers).reduce((prev, [key, value]) => {
                      prev[key] = value && typeof value === "string" ? snipString(value) : value
                      return prev
                    }, {} as Record<string, any>)
                      .$$.pretty
                  }))
                })
              )
                .tapErrorCause(cause => Effect(console.error("Error occurred while reporting error", cause)))
            )
            .tap(() =>
              RequestSettings.get.flatMap(s => {
                const headers = reply.getHeaders()
                return Effect.logInfo("Finished request").apply(Effect.logAnnotates({
                  method: req.method,
                  path: req.originalUrl,
                  statusCode: reply.statusCode.toString(),
                  ...s.verbose
                    ? {
                      resHeaders: headers.$$.pretty
                    } :
                    undefined
                }))
              })
            )
            .provideService(RequestContext.Tag, requestContext) // otherwise external error reporter breaks.
            .setupRequest(requestContext)
        )
    )
  }
}

export type RequestHandlers = { [key: string]: BasicRequestHandler }
export type BasicRequestHandler = RequestHandler<any, any, any, any, any, any, any, any, ValidationError>

export type AnyRequestHandler = RequestHandler<any, any, any, any, any, any, any, any, any>

type RouteAll<T extends RequestHandlers> = {
  [K in keyof T]: T[K] extends RequestHandler<
    infer R,
    any, // infer PathA,
    any, // infer CookieA,
    any, // infer QueryA,
    any, // infer BodyA,
    any, // infer HeaderA,
    any, // infer ReqA,
    any, // infer ResA,
    ValidationError // infer ResE
  > ? RouteMatch<R, never>
    : never
}

export type RouteMatch<
  R,
  // PathA,
  // CookieA,
  // QueryA,
  // BodyA,
  // HeaderA,
  // ReqA extends PathA & QueryA & BodyA,
  // ResA,
  PR = never
> = Effect<
  | Fa.FastifyAppConfig
  | Fa.FastifyApp
  | Exclude<
    R,
    PR
  >,
  never,
  RouteDescriptorAny // RouteDescriptor<R, PathA, CookieA, QueryA, BodyA, HeaderA, ReqA, ResA, SupportedErrors, Methods>
>

/**
 * Gather all handlers of a module and attach them to the Server.
 * Requires no login.
 */
export function matchAll<T extends RequestHandlers>(handlers: T) {
  const mapped = handlers.$$.keys.reduce((prev, cur) => {
    prev[cur] = match(handlers[cur] as AnyRequestHandler, defaultBasicErrorHandler)
    return prev
  }, {} as any) as RouteAll<typeof handlers>

  return mapped
}

/**
 * Gather all handlers of a module and attach them to the Server.
 * Requires no login.
 */
export function matchAllAlt<T extends RequestHandlersTest>(handlers: T) {
  const mapped = handlers.$$.keys.reduce((prev, cur) => {
    const matches = matchAll(handlers[cur])
    matches.$$.keys.forEach(key => prev[`${cur as string}.${key as string}`] = matches[key])
    return prev
  }, {} as any) as Flatten<RouteAllTest<typeof handlers>>

  return mapped
}

export type RequestHandlersTest = {
  [key: string]: Record<string, BasicRequestHandler>
}

export type RouteAllTest<T extends RequestHandlersTest> = {
  [K in keyof T]: RouteAll<T[K]>
}

// type JoinObjects<T extends Record<string, Record<string, any>> = { [`${K in keyof T }`]: RouteAll<T[K]> }

export type Flatten<T extends object> = object extends T ? object : {
  [K in keyof T]-?: (
    x: NonNullable<T[K]> extends infer V ? V extends object ? V extends readonly any[] ? Pick<T, K>
        : FlattenLVL1<V> extends infer FV ? ({
            [P in keyof FV as `${Extract<K, string | number>}.${Extract<P, string | number>}`]: FV[P]
          })
        : never
      : Pick<T, K>
      : never
  ) => void
} extends Record<keyof T, (y: infer O) => void> ? O extends unknown /* infer U */ ? { [K in keyof O]: O[K] } : never
: never

type FlattenLVL1<T extends object> = object extends T ? object : {
  [K in keyof T]-?: (
    x: NonNullable<T[K]> extends infer V ? V extends object ? V extends readonly any[] ? Pick<T, K>
          /*: Flatten<V> extends infer FV ? ({
      [P in keyof FV as `${Extract<K, string | number>}.${Extract<P, string | number>}`]: FV[P]
    })
    : never
    */
        : Pick<T, K>
      : never
      : never
  ) => void
} extends Record<keyof T, (y: infer O) => void> ? O extends unknown /* infer U */ ? { [K in keyof O]: O[K] } : never
: never

export function handle<
  TModule extends Record<
    string,
    any // { Model: MO.SchemaAny; new (...args: any[]): any } | MO.SchemaAny
  >
>(
  _: TModule & { ResponseOpenApi?: any },
  adaptResponse?: any
) {
  // TODO: Prevent over providing // no strict/shrink yet.
  const Request = MO.extractRequest(_)
  const Response = MO.extractResponse(_)

  type ReqSchema = MO.GetRequest<TModule>
  type ResSchema = MO.GetResponse<TModule>
  type Req = InstanceType<
    ReqSchema extends { new(...args: any[]): any } ? ReqSchema
      : never
  >
  type Res = MO.ParsedShapeOf<Extr<ResSchema>>

  return <R, E>(
    h: (r: Req) => Effect<R, E, Res>
  ) => ({
    adaptResponse,
    h,
    Request,
    Response,
    ResponseOpenApi: _.ResponseOpenApi ?? Response
  } as ReqHandler<
    Req,
    R,
    E,
    Res,
    ReqSchema,
    ResSchema
  >)
}

export type Extr<T> = T extends { Model: MO.SchemaAny } ? T["Model"]
  : T extends MO.SchemaAny ? T
  : never

export interface ReqHandler<
  Req,
  R,
  E,
  Res,
  ReqSchema extends MO.SchemaAny,
  ResSchema extends MO.SchemaAny,
  CTX = any
> {
  h: (r: Req, ctx: CTX) => Effect<R, E, Res>
  Request: ReqSchema
  Response: ResSchema
  ResponseOpenApi: any
}

/**
 * Provided a module with resources, and provided an Object with resource handlers, will prepare route handlers to be attached to server.
 * @param mod The module with Resources you want to match.
 * @returns A function that must be called with an Object with a handler "Request -> Effect<R, E, Response>" for each resource defined in the Module.
 *
 * Example:
 * ```
 * class SayHelloRequest extends Get("/say-hello")<SayHelloRequest>()({ name: prop(ReasonableString) }) {}
 * class SayHelloResponse extends Model<SayHelloRequest>()({ message: prop(LongString) }) {}
 *
 * export const SayHelloControllers = matchResource({ SayHello: { SayHelloRequest, SayHelloResponse } })({
 *   SayHello: (req) => Effect({ message: `Hi ${req.name}` })
 * })
 * ```
 */
export function matchResource<TModules extends Record<string, Record<string, any>>>(mod: TModules) {
  type Keys = keyof TModules
  return <
    THandlers extends {
      [K in Keys]: (
        req: ReqFromSchema<GetRequest<TModules[K]>>
      ) => Effect<any, SupportedErrors, ResFromSchema<GetResponse<TModules[K]>>>
    }
  >(
    handlers: THandlers
  ) => {
    const handler = mod.$$.keys.reduce((prev, cur) => {
      prev[cur] = handle(mod[cur])(handlers[cur] as any)
      return prev
    }, {} as any)
    type HNDLRS = typeof handlers
    return handler as {
      [K in Keys]: ReqHandler<
        ReqFromSchema<GetRequest<TModules[K]>>,
        _R<ReturnType<HNDLRS[K]>>,
        _E<ReturnType<HNDLRS[K]>>,
        ResFromSchema<GetResponse<TModules[K]>>,
        GetRequest<TModules[K]>,
        GetResponse<TModules[K]>
      >
    }
  }
}

export type ReqFromSchema<ReqSchema> = InstanceType<
  ReqSchema extends { new(...args: any[]): any } ? ReqSchema
    : never
>

export type ResFromSchema<ResSchema> = ParsedShapeOf<Extr<ResSchema>>
