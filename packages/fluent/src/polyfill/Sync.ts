import { pipe } from "@effect-ts/core"
import * as Effect from "@effect-ts/core/Effect"
import { XPureBase } from "@effect-ts/system/XPure"
import { tapBothInclAbort_ } from "@effect-ts-app/core/Effect"
import { chain_, map_, mapError_, toEffect } from "@effect-ts-app/core/Sync"

import { makeAutoFuncs } from "./util"

const BasePrototype = XPureBase.prototype as any

const exceptions = {
  provideSomeLayer_: "inject",
}

const funcs = {
  // Uses Effect instead of Sync for most of the combinators...
  ...makeAutoFuncs(Effect, exceptions),
  // custom
  tapBothInclAbort: tapBothInclAbort_,
  toEffect,
  chain: chain_,
  map: map_,
  mapError: mapError_,
}

Object.entries(funcs).forEach(([k, v]) => {
  const f = v as any
  BasePrototype[k] = function (...args: [any]) {
    return f(this, ...args)
  }
})

BasePrototype.pipe = function (...args: [any]) {
  return pipe(this, ...args)
}
