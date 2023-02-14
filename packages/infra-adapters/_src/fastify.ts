/* eslint-disable @typescript-eslint/no-explicit-any */
// ets_tracing: off
// tracing: off

import middie from "@fastify/middie"
import type * as Middie from "@fastify/middie"
import type * as connect from "connect"
import fastify from "fastify"
import type {
  ContextConfigDefault,
  FastifyBaseLogger,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  FastifySchema,
  FastifyTypeProvider,
  FastifyTypeProviderDefault,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerBase,
  RawServerDefault,
  RouteGenericInterface,
  RouteHandler
} from "fastify"
import type {
  FastifyReplyType,
  FastifyRequestType,
  ResolveFastifyReplyType,
  ResolveFastifyRequestType
} from "fastify/types/type-provider.js"
import type { IncomingMessage, ServerResponse } from "http"

// export type _A<T extends Effect<any, any, any>> = [T] extends [
//   Effect<infer R, infer E, infer A>
// ]
//   ? A
//   : never

export type _R<T extends Effect<any, any, any>> = [T] extends [
  Effect<infer R, any, any>
] ? R
  : never

export type _E<T extends Effect<any, any, any>> = [T] extends [
  Effect<any, infer E, any>
] ? E
  : never

export class NodeServerCloseError {
  readonly _tag = "NodeServerCloseError"
  constructor(readonly error: Error) {}
}

export class NodeServerListenError {
  readonly _tag = "NodeServerListenError"
  constructor(readonly error: Error) {}
}

export const FastifyInstanceTag = Tag<FastifyInstance>()

export const FastifyAppConfigTag = "@effect-app/fastify/AppConfig" as const

export interface FastifyAppConfig {
  readonly _tag: typeof FastifyAppConfigTag
  readonly port: number
  readonly host: string
  readonly exitHandler: typeof defaultExitHandler
}

export const FastifyAppConfig = Tag<FastifyAppConfig>()

export function LiveFastifyAppConfig<R>(
  host: string,
  port: number,
  exitHandler: (
    req: IncomingMessage,
    res: ServerResponse
  ) => (cause: Cause<never>) => Effect<R, never, void>
) {
  return Effect.contextWith((r: Context<R>) => ({
    _tag: FastifyAppConfigTag,
    host,
    port,
    exitHandler: (
      req: IncomingMessage,
      res: ServerResponse
    ) =>
    (cause: Cause<never>) => exitHandler(req, res)(cause).provideContext(r)
  })).toLayer(FastifyAppConfig)
}

export const FastifyAppTag = "@effect-app/fastify/App" as const

export const makeFastifyApp = Effect.gen(function*(_) {
  // if scope closes, set open to false
  const open = yield* _(
    Ref.make(true)
      .acquireRelease(
        a => Effect(() => a.set(false))
      )
  )

  const app = yield* _(
    Effect(() => fastify()).tap(app =>
      Effect.promise<undefined>(app.register(middie, {
        hook: "onRequest" // default
      }) as unknown as Promise<undefined>)
    )
  )

  const { exitHandler, host, port } = yield* _(FastifyAppConfig.access)

  // if scope opens, create server, on scope close, close connections and server.
  yield* _(
    Effect.async<never, never, FastifyInstance>(cb => {
      const onError = (_req: FastifyRequest, _reply: FastifyReply, err: Error) => {
        cb(Effect.die(new NodeServerListenError(err)))
      }
      app.get
      app.listen({ host, port }, (err, _address) => {
        if (err) {
          cb(Effect.die(new NodeServerListenError(err)))
        } else {
          cb(
            Effect(app)
          )
        }
      })
      app.addHook("onError", onError)
      // app.addHook("onClose", (_instance, _done) => {})
    }).acquireRelease(
      app =>
        Effect.async<never, never, void>(cb => {
          void app.close().then(err => {
            if (err) {
              cb(Effect.die(new NodeServerCloseError(err)))
            } else {
              cb(Effect.unit)
            }
          })
        })
    )
  )

  const supervisor = yield* _(
    Supervisor.track().acquireRelease(s => s.value().flatMap(_ => _.interruptAll))
  )

  function runtime<
    Handler extends EffectRouteHandler<any, any, any, any, any, any, any, any, any, any, any>
  >(handler: Handler) {
    type Env = _R<
      Handler extends EffectRouteHandler<infer R, any, any, any, any, any, any, any, any, any, any>
        ? Effect<R, never, void>
        : never
    >
    return Effect.runtime<Env>().map((r): RouteHandler => (req, reply) => {
      r.runCallback(
        open.get
          .flatMap(open => open ? handler(req, reply) : Effect.interrupt())
          .onError(exitHandler(req.raw, reply.raw as ServerResponse))
          .supervised(supervisor)
      )
    })
  }

  function middieRuntime<
    Handler extends EffectMiddieHandler<any>
  >(handler: Handler) {
    type Env = _R<
      Handler extends EffectMiddieHandler<infer R> ? Effect<R, never, void>
        : never
    >
    return Effect.runtime<Env>().map((r): Middie.Handler => (req, res, next) => {
      r.runCallback(
        open.get
          .flatMap(open => open ? handler(req, res, next) : Effect.interrupt())
          .onError(exitHandler(req, res))
          .supervised(supervisor)
      )
    })
  }

  // function middieSimpleRuntime<
  //   Handler extends EffectMiddieSimpleHandler<any>
  // >(handler: Handler) {
  //   type Env = _R<
  //     Handler extends EffectMiddieSimpleHandler<infer R> ? Effect<R, never, void>
  //       : never
  //   >
  //   return Effect.runtime<Env>().map((r): Middie.SimpleHandleFunction => (req, res) => {
  //     r.runCallback(
  //       open.get
  //         .flatMap(open => open ? handler(req, res) : Effect.interrupt())
  //         .onError(exitHandler(req, res))
  //         .supervised(supervisor)
  //     )
  //   })
  // }

  // function middieNextRuntime<
  //   Handler extends EffectMiddieNextHandler<any>
  // >(handler: Handler) {
  //   type Env = _R<
  //     Handler extends EffectMiddieNextHandler<infer R> ? Effect<R, never, void>
  //       : never
  //   >
  //   return Effect.runtime<Env>().map((r): Middie.NextHandleFunction => (req, res, next) => {
  //     r.runCallback(
  //       open.get
  //         .flatMap(open => open ? handler(req, res, next) : Effect.interrupt())
  //         .onError(exitHandler(req, res))
  //         .supervised(supervisor)
  //     )
  //   })
  // }

  return {
    _tag: FastifyAppTag,
    app,
    supervisor,
    runtime,
    middieRuntime
    // middieSimpleRuntime,
    // middieNextRuntime
  }
})

export interface FastifyApp extends Effect.Success<typeof makeFastifyApp> {}
export const FastifyApp = Tag<FastifyApp>()
export const LiveFastifyApp = makeFastifyApp.toScopedLayer(FastifyApp)

export type FastifyEnv = FastifyAppConfig | FastifyApp

export function LiveFastify(host: string, port: number): Layer<never, never, FastifyEnv>
export function LiveFastify<R>(
  host: string,
  port: number,
  exitHandler: (
    req: IncomingMessage,
    reply: ServerResponse
  ) => (cause: Cause<never>) => Effect<R, never, void>
): Layer<R, never, FastifyEnv>
export function LiveFastify<R>(
  host: string,
  port: number,
  exitHandler?: (
    req: IncomingMessage,
    reply: ServerResponse
  ) => (cause: Cause<never>) => Effect<R, never, void>
): Layer<R, never, FastifyEnv> {
  return (
    LiveFastifyAppConfig(host, port, exitHandler || defaultExitHandler) > LiveFastifyApp
  )
}

export const fastifyApp = FastifyApp.accessWith(_ => _.app)

export function withFastifyApp<R, E, A>(self: (app: FastifyInstance) => Effect<R, E, A>) {
  return FastifyApp.accessWithEffect(_ => self(_.app))
}

export const methods = [
  "all",
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "options",
  "head"
  // "checkout",
  // "connect",
  // "copy",
  // "lock",
  // "merge",
  // "mkactivity",
  // "mkcol",
  // "move",
  // "m-search",
  // "notify",
  // "propfind",
  // "proppatch",
  // "purge",
  // "report",
  // "search",
  // "subscribe",
  // "trace",
  // "unlock",
  // "unsubscribe"
] as const

export type Methods = typeof methods[number]

export type Route = string

export interface ParamsDictionary {
  [key: string]: string
}

export interface ParsedQs {
  [key: string]: undefined | string | string[] | ParsedQs | ParsedQs[]
}

export interface EffectRouteHandler<
  R,
  RawServer extends RawServerBase = RawServerDefault,
  RawRequest extends RawRequestDefaultExpression<RawServer> = RawRequestDefaultExpression<RawServer>,
  RawReply extends RawReplyDefaultExpression<RawServer> = RawReplyDefaultExpression<RawServer>,
  Logger extends FastifyBaseLogger = FastifyBaseLogger,
  TypeProvider extends FastifyTypeProvider = FastifyTypeProviderDefault,
  RouteGeneric extends RouteGenericInterface = RouteGenericInterface,
  SchemaCompiler extends FastifySchema = FastifySchema,
  ContextConfig = ContextConfigDefault,
  RequestType extends FastifyRequestType = ResolveFastifyRequestType<TypeProvider, SchemaCompiler, RouteGeneric>,
  ReplyType extends FastifyReplyType = ResolveFastifyReplyType<TypeProvider, SchemaCompiler, RouteGeneric>
> {
  (
    req: FastifyRequest<
      RouteGeneric,
      RawServer,
      RawRequest,
      SchemaCompiler,
      TypeProvider,
      ContextConfig,
      Logger,
      RequestType
    >,
    reply: FastifyReply<
      RawServer,
      RawRequest,
      RawReply,
      RouteGeneric,
      ContextConfig,
      SchemaCompiler,
      TypeProvider,
      ReplyType
    >
  ): Effect<R & FastifyInstance<RawServer, RawRequest, RawReply, Logger, TypeProvider>, never, void>
}

export interface EffectMiddieSimpleHandler<R> {
  (
    req: IncomingMessage & Middie.IncomingMessageExtended,
    res: ServerResponse
  ): Effect<R, never, void>
}

export interface EffectMiddieNextHandler<R> {
  (
    req: connect.IncomingMessage & Middie.IncomingMessageExtended,
    res: ServerResponse,
    next: connect.NextFunction
  ): Effect<R, never, void>
}

export type EffectMiddieHandler<R> = EffectMiddieSimpleHandler<R> | EffectMiddieNextHandler<R>

export function fastifyRuntime<
  Handler extends EffectRouteHandler<any, any, any, any, any, any, any, any, any, any, any>
>(handler: Handler) {
  return FastifyApp.accessWithEffect(_ => _.runtime(handler))
}

export function fastifyMiddieRuntime<
  Handler extends EffectMiddieHandler<any>
>(handler: Handler) {
  return FastifyApp.accessWithEffect(_ => _.middieRuntime(handler))
}

export function match(method: Methods): {
  <
    Handler extends EffectRouteHandler<any, any, any, any, any, any, any, any, any, any, any>
  >(
    route: Route,
    handler: Handler
  ): Effect<
    | FastifyEnv
    | _R<
      Handler extends EffectRouteHandler<infer R, any, any, any, any, any, any, any, any, any, any>
        ? Effect<R, never, void>
        : never
    >,
    never,
    void
  >
} {
  return function(route, handler) {
    return fastifyRuntime(handler).flatMap(handler =>
      withFastifyApp(app =>
        Effect(() => {
          app[method](route, handler)
        })
      )
    )
  }
}

export function defaultExitHandler(
  _req: IncomingMessage,
  res: ServerResponse
): (cause: Cause<never>) => Effect<never, never, void> {
  return cause =>
    Effect(() => {
      if (cause.isDie()) {
        console.error(cause.pretty)
      }
      res.statusCode = 500
    })
}

export function use<
  Handler extends EffectMiddieHandler<any>
>(
  handler: Handler
): Effect<
  | FastifyEnv
  | _R<
    Handler extends EffectMiddieHandler<infer R> ? Effect<R, never, void> : never
  >,
  never,
  void
>
export function use<
  Handler extends EffectMiddieHandler<any>
>(
  route: Route,
  handler: Handler
): Effect<
  | FastifyEnv
  | _R<
    Handler extends EffectMiddieHandler<infer R> ? Effect<R, never, void> : never
  >,
  never,
  void
>
export function use<
  Handler extends EffectMiddieHandler<any>
>(
  routes: NonEmptyArray<Route>,
  handler: Handler
): Effect<
  | FastifyEnv
  | _R<
    Handler extends EffectMiddieHandler<infer R> ? Effect<R, never, void> : never
  >,
  never,
  void
>
export function use(...args: [any, ...any[]]) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return withFastifyApp(app => {
    return fastifyMiddieRuntime(
      args.pop() as unknown as EffectMiddieHandler<any>
    ).flatMap(fn => Effect(() => (args.length ? app.use(args[0] as Route, fn) : app.use(fn)) as unknown as void))
  })
}

export const all = match("all")
export const get = match("get")
export const post = match("post")
export const put = match("put")
const delete_ = match("delete")
export { delete_ as delete }
export const patch = match("patch")
export const options = match("options")
export const head = match("head")
// export const checkout = match("checkout")
// export const connect = match("connect")
// export const copy = match("copy")
// export const lock = match("lock")
// export const merge = match("merge")
// export const mkactivity = match("mkactivity")
// export const mkcol = match("mkcol")
// export const move = match("move")
// export const mSearch = match("m-search")
// export const notify = match("notify")
// export const propfind = match("propfind")
// export const proppatch = match("proppatch")
// export const purge = match("purge")
// export const report = match("report")
// export const search = match("search")
// export const subscribe = match("subscribe")
// export const trace = match("trace")
// export const unlock = match("unlock")
// export const unsubscribe = match("unsubscribe")

/**
 * Lift an Fastify routeHandler into an effectified variant
 */
export function classic(_: RouteHandler): EffectRouteHandler<FastifyInstance> {
  return (req, reply) =>
    Effect.service(FastifyInstanceTag)
      .flatMap(app => Effect(() => _.bind(app)(req, reply)))
}

/**
 * The same as Effect.never, keeps the main fiber alive until interrupted
 */
export const listen = Effect.never
