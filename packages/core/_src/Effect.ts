/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prefer-destructuring */
// eslint-disable-next-line @typescript-eslint/no-unused-vars

import * as Def from "effect/Deferred"
import * as Either from "effect/Either"
import * as Fiber from "effect/Fiber"
import { Option } from "effect/Option"
import { curry, pipe } from "./Function.js"
import { typedKeysOf } from "./utils.js"

export * from "effect/Effect"

/**
 * @macro traced
 * @tsplus fluent effect/io/Effect flatMapOpt
 */
export function flatMapOption<R, E, A, R2, E2, A2>(
  self: Effect<Option<A>, E, R>,
  fm: (a: A) => Effect<A2, E2, R2>
): Effect<Option<A2>, E | E2, R | R2> {
  return self.flatMap((d) =>
    d.match({
      onNone: () => Effect.sync(() => Option.none()),
      onSome: (_) => fm(_).map(Option.some)
    })
  )
}

/**
 * @macro traced
 * @tsplus fluent effect/io/Effect tapOpt
 */
export function tapOption<R, E, A, R2, E2, A2>(
  self: Effect<Option<A>, E, R>,
  fm: (a: A) => Effect<A2, E2, R2>
): Effect<Option<A>, E | E2, R | R2> {
  return self.flatMap((d) =>
    d.match({
      onNone: () => Effect.sync(() => Option.none()),
      onSome: (_) => fm(_).map(() => Option.some(_))
    })
  )
}

/**
 * @macro traced
 * @tsplus fluent effect/io/Effect zipRightOpt
 */
export function zipRightOption<R, E, A, R2, E2, A2>(
  self: Effect<Option<A>, E, R>,
  fm: Effect<A2, E2, R2>
) {
  return self.flatMap((d) =>
    d.match({
      onNone: () => Effect.sync(() => Option.none()),
      onSome: (_) => fm.map(() => Option.some(_))
    })
  )
}

/**
 * @macro traced
 * @tsplus fluent effect/io/Effect mapOpt
 */
export function mapOption<R, E, A, A2>(
  self: Effect<Option<A>, E, R>,
  fm: (a: A) => A2
): Effect<Option<A2>, E, R> {
  return self.map((d) =>
    d.match({
      onNone: () => Option.none(),
      onSome: (_) => Option.some(fm(_))
    })
  )
}

/**
 * @tsplus static effect/io/Effect.Ops tryCatchPromiseWithInterrupt
 */
export function tryCatchPromiseWithInterrupt<E, A>(
  promise: LazyArg<Promise<A>>,
  onReject: (reason: unknown) => E,
  canceller: () => void
): Effect<A, E> {
  return Effect.asyncEither((resolve) => {
    promise()
      .then((x) => pipe(x, Effect.succeed, resolve))
      .catch((x) => pipe(x, onReject, Effect.fail, resolve))
    return Either.left(Effect.sync(canceller))
  })
}

/**
 * Takes [A, B], applies it to a curried Effect function,
 * taps the Effect, returning A.
 */
export function tupleTap<A, B, R, E, C>(
  f: (b: B) => (a: A) => Effect<C, E, R>
) {
  return (t: readonly [A, B]) => Effect.sync(() => t[0]).tap(f(t[1]))
}

/**
 * Takes [A, B], applies it to an Effect function,
 * taps the Effect, returning A.
 */
export function tupleTap_<A, B, R, E, C>(f: (a: A, b: B) => Effect<C, E, R>) {
  return tupleTap(curry(f))
}

export function ifDiffR<I, R, E, A>(f: (i: I) => Effect<A, E, R>) {
  return (n: I, orig: I) => ifDiff_(n, orig, f)
}

export function ifDiff_<I, R, E, A>(
  n: I,
  orig: I,
  f: (i: I) => Effect<A, E, R>
) {
  return n !== orig ? f(n) : Effect.unit
}

export function ifDiff<I, R, E, A>(n: I, orig: I) {
  return (f: (i: I) => Effect<A, E, R>) => ifDiff_(n, orig, f)
}

// NOTE: await extension doesnt work via tsplus somehow
/**
 * @tsplus static effect/io/Deferred.Ops await
 * @tsplus getter effect/io/Deferred await
 */
export const await_ = Def.await

/**
 * Ref has atomic modify support if synchronous, for Effect we need a Semaphore.
 * @tsplus fluent effect/io/Ref modifyWithEffect
 */
export function modifyWithPermitWithEffect<A>(ref: Ref<A>, semaphore: Semaphore) {
  const withPermit = semaphore.withPermits(1)
  return <R, E, A2>(mod: (a: A) => Effect<readonly [A2, A], E, R>) =>
    withPermit(
      ref
        .get
        .flatMap(mod)
        .tap(([, _]) => ref.set(_))
        .map(([_]) => _)
    )
}

/**
 * @tsplus getter Iterable joinAll
 * @tsplus static effect/io/Effect.Ops joinAll
 */
export function joinAll<E, A>(fibers: Iterable<Fiber.Fiber<A, E>>): Effect<readonly A[], E> {
  return Fiber.join(Fiber.all(fibers))
}

export type Service<T> = T extends Effect<infer S, any, any> ? S : T extends Tag<any, infer S> ? S : never
export type ServiceR<T> = T extends Effect<any, any, infer R> ? R : T extends Tag<infer R, any> ? R : never
export type ServiceE<T> = T extends Effect<any, infer E, any> ? E : never
export type Values<T> = T extends { [s: string]: infer S } ? Service<S> : never
export type ValuesR<T> = T extends { [s: string]: infer S } ? ServiceR<S> : never
export type ValuesE<T> = T extends { [s: string]: infer S } ? ServiceE<S> : never

/**
 * Due to tsplus unification (tsplus unify tag), when trying to use the Effect type in a type constraint
 * the compiler will cause basically anything to match. as such, use this type instead.
 * ```ts
 * const a = <
 *  SVC extends Record<
 *    string,
 *    ((req: number) => Effect<any, any, any>) | Effect<any, any, any>
 *   >
 * >(svc: SVC) => svc
 *
 * const b = a({ str: "" })   // valid, but shouldn't be!
 * ```
 */
export interface EffectUnunified<R, E, A> extends Effect<R, E, A> {}

export type LowerFirst<S extends PropertyKey> = S extends `${infer First}${infer Rest}` ? `${Lowercase<First>}${Rest}`
  : S
export type LowerServices<T extends Record<string, Tag<any, any> | Effect<any, any, any>>> = {
  [key in keyof T as LowerFirst<key>]: Service<T[key]>
}

/**
 * @tsplus static effect/io/Effect.Ops allLower
 */
export function allLower<T extends Record<string, Tag<any, any> | Effect<any, any, any>>>(
  services: T
) {
  return Effect.all(
    typedKeysOf(services).reduce((prev, cur) => {
      const svc = services[cur]
      prev[((cur as string)[0].toLowerCase() + (cur as string).slice(1)) as unknown as LowerFirst<typeof cur>] = svc // "_id" in svc && svc._id === TagTypeId ? svc : svc
      return prev
    }, {} as any),
    { concurrency: "inherit" }
  ) as any as Effect<LowerServices<T>, ValuesE<T>, ValuesR<T>>
}

/**
 * @tsplus static effect/io/Effect.Ops allLowerWith
 */
export function allLowerWith<T extends Record<string, Tag<any, any> | Effect<any, any, any>>, A>(
  services: T,
  fn: (services: LowerServices<T>) => A
) {
  return allLower(services).map(fn)
}

/**
 * @tsplus static effect/io/Effect.Ops allLowerWithEffect
 */
export function allLowerWithEffect<T extends Record<string, Tag<any, any> | Effect<any, any, any>>, R, E, A>(
  services: T,
  fn: (services: LowerServices<T>) => Effect<A, E, R>
) {
  return allLower(services).flatMap(fn)
}
