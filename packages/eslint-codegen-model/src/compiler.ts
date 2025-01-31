import ts, { SyntaxKind } from "typescript"

const sortUnion = (a: string, b: string) => {
  if (a !== "null" && a!== "undefined" && (b === "null" || b === "undefined")) {
    return -1
  }
  if (b !== "null" && b !== "undefined" && (a === "null" || a === "undefined")) {
    return 1
  }
  if(a < b) { return -1; }
  if(a > b) { return 1; }
  return 0;
}

const sortAlpha = (a: string, b: string) => {
  if(a < b) { return -1; }
  if(a > b) { return 1; }
  return 0;
}

// TODO: we don't support string literals with spaces in them currently.
const rx = /(([^\s\<\>\,\[\(]+)? \| ([^\s\<\>\,\]\)]+))+/

function sortIt(str: string) {
  return str.split(" | ").sort(sortUnion).join(" | ")
}

const debug = false // true

export function processNode(tc: ts.TypeChecker, root: ts.Node, writeFullTypes = false) {
  const processed: any[] = []
  return (n: ts.Node) => {
    if (/*ts.isClassDeclaration(n) || ts.isTypeAliasDeclaration(n)*/ true) {
      
      let modelName = null 
      if (ts.isClassDeclaration(n)) {
        if (n.getText().match(/(Extended(Tagged)?Class)|ExtendedTaggedRequest/)) {
          modelName = (n.name as any)?.escapedText
        }
      }
      if (!modelName) {
      const constructorName = (n as any).name?.escapedText
      // TODO: Remove requirement
      if (!constructorName?.endsWith("Constructor")) {
        //console.log("$$$constructorName doesnt end with Constructor", constructorName)
        return
      }
      modelName = constructorName.replace("Constructor", "")
    }
    if (processed.includes(modelName)) { return }
    processed.push(modelName)

      if (!writeFullTypes) {
        return [
          `export namespace ${modelName} {`,
          `  /**`,
          `   * @tsplus type ${modelName}.From`,
          `   * @tsplus companion ${modelName}.From/Ops`,
          `   */`,
          `  export class From extends S.FromClass<typeof ${modelName}>() {}`,
          // `  export const From: FromOps = { $: {} }`,
          // `  /**`,
          // `   * @tsplus type ${modelName}.From/Aspects`,
          // `   */`,
          // `  export interface FromAspects {}`,
          "}",
        ]
      }

      //console.log("$$$ constructorName", constructorName)

      const t = tc.getTypeAtLocation(n)

      const result = { encoded: [] as string[], parsed: [] as string[] }
      const unions: Record<string, string> = {}

      //console.log("$$$ fields", t.getProperties().map(x => x.escapedName))
      t.getProperties().forEach((c) => {
        const method = c.name
        if (method === "encoded" || method === "parsed") {
          //console.log("$$$ method", method)
          //console.log(c.members)
          const tt = tc.getTypeOfSymbolAtLocation(c, n)
          // const s = tc.getReturnTypeOfSignature(tt.getCallSignatures()[0])

          // const type = tc.getReturnTypeOfSignature(s! as any /* TODO */)


          tt.getProperties().forEach(p => {
            const isLookup = debug && p.escapedName === "carrier"

            //kind = 207, 
            //arguments[0].escapedText === "HosterRole"
            //console.log("$$$p", p.escapedName)
            //if (p.escapedName === "opposite") {
              //console.log("$$$ a union!", p.declarations?.map(x => x.forEachChild(c => {

              // TODO: have to find nullable, array, set, map, etc.
              // TODO: "From"
              // but also should find fully custom sets like PurchaseOrderModulesSet - we should be able to just use those directly, incl PurchaseOrderModulesSet.From
              // for now just skip them?
                p.declarations?.map(x => x.forEachChild(c => {
                  if (isLookup) {
                    console.log("$$$ lookup", c.kind, c)
                  }
                if (c.kind === SyntaxKind.CallExpression) { // 207 -- SyntaxKind.ElementAccessExpression) {
                  let it = (c as any).arguments[0]
                  //const isState = p.escapedName === "state"
                  if (isLookup) {
                    console.log("$$$ state it", it)
                  }
                  const isNullable = it.expression?.escapedText === "nullable"
                  const isIt = it.arguments && it.arguments[0] //it.expression?.escapedText === "nullable"
                  if (isIt) {
                    //console.log("$$ nullable", it.arguments[0])
                    // TODO: usually the union is on the last input, we need to support all elements individually however
                    it = it.arguments[it.arguments.length - 1]
                  }
                  //console.log("$args", it)
                  //tc.getTypeAtLocation(it)
                  const tt = tc.getTypeAtLocation(c) //tc.getTypeOfSymbolAtLocation(it.parent, n)
                  const typeDecl = tc.typeToString(
                    tt,
                    root,
                    ts.TypeFormatFlags.NoTruncation
                    //ts.TypeFormatFlags.None
                    //ts.TypeFormatFlags.AddUndefined |
                    // | ts.TypeFormatFlags.NoTypeReduction
                    //    | ts.TypeFormatFlags.MultilineObjectLiterals
                       //| ts.TypeFormatFlags.InTypeAlias
                      | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope // prevents import(*)
                    //  | ts.TypeFormatFlags.UseStructuralFallback
                  )
                  if (isLookup) {
                    console.log("$$ type", typeDecl)
                  }
                  const matches = typeDecl.match(rx)
                  if (isLookup) {
                    console.log("$$ matches", matches)
                }
                const isOptional = typeDecl.match(/\>, "optional"/)
                  if (matches) {
                    let replaced = matches[0]!.replace(rx, (match) => sortIt(match))
                    replaced = sortIt(isOptional ? isNullable ? replaced.replace(" | null", " | undefined | null") : replaced + " | undefined" : replaced)
                    //console.log("$$ replaced", replaced, it.escapedText, matches)
                    // if (it.escapedText === "TaskState") {
                    //   console.log("Help", it)
                    // }
                    if (isLookup) {
                      console.log("$$$ replaced", it.escapedText, replaced)
                    }
                    if (it.escapedText && !it.escapedText.endsWith("Set") /* skip the "Set" problem */ && replaced.replace(" | null", "").includes("|")) {
                      const replacement = it.escapedText + (isNullable ? " | null" : "") + (isOptional ? " | undefined" : "")
                      // if (it.escapedText === "TaskState") {
                      //   console.log("$$$", { replaced, replacement })
                      //   unions[replaced] = replacement  
                      // } else {
                      unions[replaced] = replacement
                      if (isLookup) {
                        console.log("$$ repl", { replaced, replacement})
                      }
                      //}
                    } else {
                    //   if (isIt) {
                    //     console.log("$$ no name found", it.escapedText)
                    // }
                    //   console.log("$$ no name found??", it)
                    }
                  }
                  
                }
                //c.kind === 346 ? console.log(c) : null
                //console.log((c as any).flowNode?.node?.name)
              }))
            //}
          })

          if (debug && Object.keys(unions).length) {
            console.log("$$$ unions to replace", unions)
          }

          const typeDecl = tc.typeToString(
            tt,
            root,
            ts.TypeFormatFlags.NoTruncation
            //ts.TypeFormatFlags.None
            //ts.TypeFormatFlags.AddUndefined |
            // | ts.TypeFormatFlags.NoTypeReduction
            //    | ts.TypeFormatFlags.MultilineObjectLiterals
               //| ts.TypeFormatFlags.InTypeAlias
              | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope // prevents import(*)
            //  | ts.TypeFormatFlags.UseStructuralFallback
          )
          const str = typeDecl === "{}" ? [] :
          // drop leading { and trailing }
          typeDecl.substring(2, typeDecl.length - 2)
            .split(";")
            .map(l => l.trim())
            // todo; skip the first split, as its the property
            .map(l => l.replace(rx, (match) => {
                const rpl = sortIt(match)
                //if (debug) { console.log("Searching for", rpl, { unions}) }
                if (rpl.endsWith(" | undefined")) {
                  const sub = unions[rpl.replace(" | undefined", "")]
                  return sub ? sub + " | undefined" : unions[rpl] ?? rpl
                }

                const sub = unions[rpl]
                return (sub ? sub : rpl)
              })
              .replaceAll(" Array<", " ReadonlyArray<") // .replaceAll(/(Array|Set|Map)\</", "ReadonlyArray<") //
              .replaceAll(" Set<", " ReadonlySet<")
              .replaceAll(" Map<", " ReadonlyMap<")
              .replaceAll("(Array<", "(ReadonlyArray<") // .replaceAll(/(Array|Set|Map)\</", "ReadonlyArray<") //
              .replaceAll("(Set<", "(ReadonlySet<")
              .replaceAll("(Map<", "(ReadonlyMap<")
                .replaceAll(" Array.Array<", " ReadonlyArray<") // .replaceAll(/(Array|Set|Map)\</", "ReadonlyArray<") //
                .replaceAll(" Set.Set<", " ReadonlySet<")
                .replaceAll(" Map.Map<", " ReadonlyMap<")
            )
          // we sort for now, because otherwise we have sometimes multiple times changing back and forth between editor and console.
          .sort(sortAlpha)
          // Taken care of by "ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope"
          //.replaceAll(/import\("[^"]+"\)\./g, "")

          result[method] = str
        }
      })

      if (!("parsed" in result)) {
        throw new Error("No parsed result")
      }
      if (!("encoded" in result)) {
        throw new Error("No encoded result")
      }


      const encoded = result.encoded.filter(x => !!x)
      const parsed = result.parsed.filter(x => !!x)

      return [
        `export interface ${modelName} {${parsed.length ? "\n" + parsed.map(l => "  " + l).join("\n") + "\n" : ""}}`,
        `export namespace ${modelName} {`,
        `  /**`,
        `   * @tsplus type ${modelName}.From`,
        `   */`,
        `  export interface From {${encoded.length ? "\n" + encoded.map(l => "    " + l).join("\n") + "\n  " : ""}}`,
        `  export const From: FromOps = {}`,
        // `  export const From: FromOps = { $: {} }`,
        // `  /**`,
        // `   * @tsplus type ${modelName}.From/Aspects`,
        // `   */`,
        // `  export interface FromAspects {}`,
        `  /**`,
        `   * @tsplus type ${modelName}.From/Ops`,
        `   */`,
        `  export interface FromOps {}`,
        "}",
      ]
    }
  }
}