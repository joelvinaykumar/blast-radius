# Graph Relationship Model

## Problem with the current model

The ingestion pipeline creates **DEPENDS_ON** edges from *every* symbol declared in a file to the *module* symbol of each imported file. This means a file that declares 10 symbols and imports 5 modules creates **50** DEPENDS_ON edges—even if only one symbol actually uses one import. The graph is noisy and the queries built on top of it produce misleading results.

### Current node/edge schema

```
(:Repository)-[:HAS_FILE]->(:File)
(:Repository)-[:HAS_SYMBOL]->(:Symbol)
(:File)-[:DECLARES]->(:Symbol)          // file → each declared symbol + a synthetic #module symbol
(:Symbol)-[:DEPENDS_ON]->(:Symbol)      // every symbol in a file → every imported module symbol
```

### Why blast radius is wrong

`DEPENDS_ON` is a fan-out from **every** local symbol to **every** import target. When the query walks `(seed)-[:DEPENDS_ON*1..N]->(impacted)`, it follows edges that don't represent real usage, so it returns symbols that have no actual coupling to the seed.

### Why affected pages is wrong

The affected-pages query walks the reverse direction: `(changedSymbol)<-[:DEPENDS_ON*1..N]-(pageSymbol)`. Because the forward edges are over-connected, the reverse walk over-reports pages. Additionally the query traces through the `#module` synthetic symbol rather than through specific named exports, so nearly every page that transitively imports any file from a changed file's neighbourhood appears as affected.

---

## Proposed model

### Node labels

| Label | Key properties | Description |
|-------|---------------|-------------|
| `Repository` | `id`, `url`, `name`, `branch`, `ingestedAt` | Root node per ingested repo |
| `File` | `id` (`repoId:relPath`), `path`, `repoId` | One per source file |
| `Symbol` | `id` (`repoId:filePath#name`), `fqn`, `name`, `kind`, `filePath`, `repoId`, `exportedName?` | A single named declaration (function, class, component, type, variable, enum) |

> **Drop the synthetic `#module` symbol.** It serves no purpose once edges are specific.

### Symbol `kind` values

`function` · `class` · `variable` · `type` · `interface` · `enum` · `component` (React) · `hook` (React `use*`) · `package` (npm externals)

### Relationship types

| Relationship | Direction | Meaning |
|-------------|-----------|---------|
| `HAS_FILE` | `Repository → File` | Repo owns file |
| `DECLARES` | `File → Symbol` | File declares/exports symbol |
| `IMPORTS` | `File → Symbol` | File imports a specific named export from another file or package |
| `USES` | `Symbol → Symbol` | Symbol A references Symbol B in its body (call, read, extend, implement) |
| `EXPORTS` | `File → Symbol` | File re-exports a symbol (important for barrel files) |

### Key changes from current model

1. **`DEPENDS_ON` is replaced by `IMPORTS` + `USES`.** `IMPORTS` is a file-level edge ("this file imports symbol X"). `USES` is a symbol-level edge ("function A calls function B"). This separation lets queries distinguish between "the file happens to import it" and "this symbol actually references it".

2. **`USES` edges are specific.** During parsing, for each declaration body, resolve identifier references to their imported symbol. Only create a `USES` edge when a reference is actually found in the AST body of the declaring symbol.

3. **No more fan-out multiplication.** A file with 10 declarations and 5 imports no longer creates 50 edges. Instead the file gets 5 `IMPORTS` edges and each symbol gets only the `USES` edges it actually needs.

---

## How to build `USES` edges during ingestion

```
for each sourceFile:
  for each declaration (function, class, variable, etc.):
    walk the declaration's AST body
    for each identifier reference found:
      resolve it to its defining symbol (via ts-morph's type checker or import map)
      if the defining symbol lives in another file or package:
        create a USES edge:  thisSymbol → targetSymbol
```

### ts-morph resolution strategy

```ts
// For each identifier node inside a declaration body:
const definition = identifierNode.getDefinitionNodes?.()[0]
  ?? identifierNode.getSymbol()?.getDeclarations()?.[0];

if (definition) {
  const defSourceFile = definition.getSourceFile();
  const defFilePath   = relativePosix(repoDir, defSourceFile.getFilePath());
  // → create USES edge from current symbol to defFilePath#symbolName
}
```

For named imports (`import { Foo } from "./bar"`), the target symbol is `repoId:bar.tsx#Foo`. For default imports, it is `repoId:bar.tsx#default`. For namespace imports (`import * as Bar`), the target is the module-level barrel and a `USES` edge should point to each actually-referenced member.

---

## Revised queries

### Blast radius

_"Given a seed symbol, what other symbols/files are impacted by a change?"_

Traverse **reverse** `USES` edges: find all symbols that **use** the seed, then recurse.

```cypher
MATCH (repo:Repository {id: $repoId})-[:HAS_FILE]->(f:File)-[:DECLARES]->(seed:Symbol {fqn: $symbol})

CALL apoc.path.expandConfig(seed, {
  relationshipFilter: '<USES',
  labelFilter: '+Symbol',
  minLevel: 1,
  maxLevel: $maxDepth,
  uniqueness: 'NODE_GLOBAL'
}) YIELD path

WITH seed, last(nodes(path)) AS impacted, path
WHERE impacted.repoId = $repoId

RETURN
  collect(DISTINCT {
    id:       impacted.id,
    label:    impacted.name,
    kind:     impacted.kind,
    filePath: impacted.filePath,
    depth:    length(path)
  }) AS impactedSymbols,
  collect(DISTINCT impacted.filePath) AS impactedFiles
```

If APOC is unavailable, use a bounded variable-length pattern:

```cypher
MATCH (repo:Repository {id: $repoId})
MATCH (repo)-[:HAS_FILE]->(:File)-[:DECLARES]->(seed:Symbol {fqn: $symbol})
OPTIONAL MATCH path=(seed)<-[:USES*1..8]-(consumer:Symbol)
WHERE length(path) <= $maxDepth
  AND consumer.repoId = $repoId

WITH seed,
     collect(DISTINCT consumer) AS consumers,
     collect(DISTINCT path)     AS paths

UNWIND ([seed] + consumers) AS node
WITH collect(DISTINCT {
  id:       node.id,
  label:    node.name,
  kind:     node.kind,
  filePath: node.filePath,
  score:    null
}) AS nodes, paths

UNWIND paths AS p
UNWIND relationships(p) AS rel
WITH nodes, collect(DISTINCT {
  id:     elementId(rel),
  source: startNode(rel).id,
  target: endNode(rel).id,
  type:   type(rel)
}) AS edges

RETURN nodes, edges
```

> **Direction matters.** The current query follows `(seed)-[:DEPENDS_ON*]->(impacted)` which asks "what does the seed depend on?". That's the wrong direction for blast radius. We need **who depends on the seed**, i.e. `(seed)<-[:USES*]-(consumer)`.

### Affected pages

_"Given a list of changed files, which route pages are affected?"_

```cypher
MATCH (repo:Repository {id: $repoId})
UNWIND $changedFiles AS changedFile
MATCH (repo)-[:HAS_FILE]->(changed:File {path: changedFile})-[:DECLARES]->(changedSymbol:Symbol)

// Find all symbols that transitively USES any symbol declared in the changed file
OPTIONAL MATCH (changedSymbol)<-[:USES*1..8]-(consumer:Symbol)
WHERE consumer.repoId = $repoId

WITH changed, changedSymbol, collect(DISTINCT consumer) + [changedSymbol] AS allAffected
UNWIND allAffected AS affected

// Find the file that declares each affected symbol, then check if it's a page/layout/route
MATCH (pageFile:File)-[:DECLARES]->(affected)
WHERE pageFile.repoId = $repoId
  AND pageFile.path STARTS WITH 'app/'
  AND pageFile.path =~ '.*(page|layout|route)\\.(ts|tsx|js|jsx|mts|cts)$'

RETURN DISTINCT {
  route: CASE
    WHEN pageFile.path = 'app/page.tsx' THEN '/'
    ELSE replace(replace(pageFile.path, 'app', ''), '/page.tsx', '')
  END,
  filePath:   pageFile.path,
  changedFile: changed.path,
  symbols:     collect(DISTINCT affected.name)
} AS page
ORDER BY page.route ASC
```

---

## Migration checklist

1. **Update `collectDeclarationSymbols`** — already correct, keep as-is.
2. **Replace the import-loop in `parseRepositoryGraph`** — instead of fanning out DEPENDS_ON from every local symbol to every import target, create:
   - One `IMPORTS` edge per `File → imported Symbol`.
   - `USES` edges by walking each declaration body's AST and resolving references.
3. **Drop the `#module` synthetic symbol** — it was the hub through which all fan-out flowed; no longer needed.
4. **Update `writeGraph`** — write `IMPORTS` and `USES` batches instead of `DEPENDS_ON`.
5. **Update queries in `lib/queries.ts`** — replace `DEPENDS_ON` with `USES` and fix traversal direction for blast radius (reverse walk).
6. **Update affected-pages response** — include `symbols` array so the UI can show which symbols in each page are actually affected.
7. **Update `AffectedPageSchema`** — add `symbols: z.array(z.string())` field.
8. **Update results panel UI** — render the symbols list under each affected page entry.

---

## Example graph (after migration)

```
(Repository: raga-fe)
  ├─[:HAS_FILE]─► (File: src/contexts/auth-context.tsx)
  │                 ├─[:DECLARES]─► (Symbol: AuthContext, kind: variable)
  │                 ├─[:DECLARES]─► (Symbol: AuthProvider, kind: function)
  │                 ├─[:DECLARES]─► (Symbol: useAuth, kind: function)
  │                 └─[:IMPORTS]──► (Symbol: createContext, package: react)
  │
  ├─[:HAS_FILE]─► (File: src/components/login-form.tsx)
  │                 ├─[:DECLARES]─► (Symbol: LoginForm, kind: component)
  │                 │                 └─[:USES]─► (Symbol: useAuth)  ← specific edge
  │                 └─[:IMPORTS]──► (Symbol: useAuth)
  │
  ├─[:HAS_FILE]─► (File: app/page.tsx)
  │                 ├─[:DECLARES]─► (Symbol: HomePage, kind: component)
  │                 │                 └─[:USES]─► (Symbol: LoginForm)
  │                 └─[:IMPORTS]──► (Symbol: LoginForm)
```

**Blast radius of `AuthContext`:**
```
AuthContext  ← seed
  └── useAuth         (uses AuthContext)
        └── LoginForm (uses useAuth)
              └── HomePage (uses LoginForm)  → app/page.tsx is affected
```

**Affected pages for changed file `src/contexts/auth-context.tsx`:**
```
app/page.tsx  (route: /)
  symbols: [HomePage]
  reason:  transitively uses useAuth → AuthContext (declared in changed file)
```
