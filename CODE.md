# Pi notebook package

Goal: Pi package exposing notebook-focused tools for safe `.ipynb` inspection and editing.

## Current state

- Repo root is now the Pi package.
- `package.json` declares a Pi package via `pi.extensions: ["./extensions"]`.
  - Pi package deps use `@earendil-works/*`; local dev links point to `../pi-mono/packages/*` via `npm link`
- Main extension entry: `extensions/notebook/index.ts`.
  - every notebook tool now has a short prompt snippet for discoverability
  - every notebook tool has compact TUI call rendering that shows selected args; summary has a collapsed text preview with expand hint
  - shared notebook-tool semantics live once on `notebook_summary` as namespaced guidelines, so deduped system-prompt guidance keeps notebook scope clear
  - path normalization at the adapter seam: strips leading `@`, resolves relative paths against `ctx.cwd`
  - all mutation tools are wrapped in `withFileMutationQueue(normalizedPath, ...)` for correctness under Pi's parallel tool execution
  - read-only tools are unqueued but still get path normalization
- Pure notebook logic lives in `extensions/notebook/notebook.ts`.
  - exported functions: parseNotebook, loadNotebook, saveNotebook, summarizeNotebook, formatNotebookSummary, ensureCellIds, readAllCells, readCellById, sliceCellSource, writeCellSource, editCellSource, applyExactSourceEdits, insertCell, deleteCell, moveCell, mergeCell, clearCellOutputs, readCellOutput, readCellAttachment, extractDataUriImages, normalizeSource
  - `readCellsById` and `readCellRange` removed from public interface (unused by any tool)
- Shared tool runners + schemas live in `extensions/notebook/tools.ts`.
  - string-valued enum parameters use Pi-recommended `StringEnum` schemas so providers see `type: "string"` plus `enum`, not `anyOf`/`const` unions
  - internal `mutateNotebook(path, mutate)` helper consolidates load → ensureCellIds → mutate → save for all mutation runners
  - `formatAssignedIds` and `selectorText` helpers reduce formatting repetition
- Implemented tools:
  - `notebook_summary({ path })`
  - `notebook_read_cell({ path, cellId?|index?, lineOffset?, lineLimit? })`
  - `notebook_write_cell({ path, cellId?|index?, source })`
  - `notebook_edit_cell({ path, cellId?|index?, edits })`
  - `notebook_insert({ path, cellId?|index?, direction, type, source })`
  - `notebook_delete({ path, cellId?|index? })`
  - `notebook_move({ path, cellId?|index?, targetCellId?|targetIndex?, direction })`
  - `notebook_merge({ path, cellId?|index?, direction })`
  - `notebook_clear_outputs({ path, cellId?|index? })`
  - `notebook_read_cell_output({ path, cellId?|index?, outputIndex, mime? })`
  - `notebook_read_cell_attachment({ path, cellId?|index?, key })`
- Current notebook support:
  - parse notebook JSON directly; require `nbformat === 4`
  - summarize kernel/language/cells via one `meta` line plus one pseudo-XML cell header per cell
  - summary/read omit `id` when the notebook cell has no stored id
  - code cell summary headers include `n_exec` only when execution count is present
  - summary preview is raw source text after each cell header, hard-limited to 5 lines; when truncated, it ends with a final `[N more lines]` line
  - summary now includes per-output pseudo-XML headers after each cell preview; output headers include `cell_id` when present, else `cell_index`, use 1-based output indices, rich outputs are flattened to one header per MIME variant, and only text-like variants include up to 5 preview lines
  - read one cell by id or 1-based index, optionally slicing source by line offset/limit; truncated reads append `[N more lines. Use offset=M to continue.]`
  - read tool text output is raw cell source only; cell metadata stays in tool `details` and in `notebook_summary`
  - source mutation tools are explicitly cell-scoped by name: `notebook_read_cell`, `notebook_write_cell`, `notebook_edit_cell`
  - mutation tools accept id selectors for notebooks that already have ids, and 1-based index selectors for notebooks that do not
  - first mutation on a no-id notebook assigns short random 8-hex ids to all cells, bumps `nbformat_minor` to `5` when needed, and appends a concise 1-based index→id mapping to tool output
  - write/edit preserve other cell fields like metadata/outputs and return concise confirmation text
  - insert one code/markdown/raw cell before or after an anchor cell id or 1-based index; `index=-1` appends
  - move one cell before or after another cell by id or 1-based index
  - merge one cell with the adjacent same-type cell `above` or `below`, preserving the anchor id and inserting one boundary newline when needed
  - clear outputs from one code cell while preserving source and execution count
  - read one output by 1-based index from a code cell; returns text for text-like mimes, image for binary image mimes (image/png, image/jpeg, etc.); image/svg+xml is returned as text; rich outputs with multiple mime types require the `mime` parameter
  - read one image attachment from a cell by key; returns image content
  - `notebook_read_cell` on markdown cells extracts `data:` URI images: replaces them with `[image: mime/type]` markers in text and returns decoded images as `ImageContent` items
  - image-returning tool paths run through Pi's inline image resizer; images that cannot be resized into provider limits become text omission notes instead of `ImageContent`
  - `test/fixtures/subtly-corrupt-images.ipynb` covers valid-looking PNG base64 whose IDAT payload is not decodable, across inline markdown, output, and attachment paths
  - `notebook_summary` lists attachment keys in cell headers via `atts="key1 key2"` attribute
  - save path rewrites notebook JSON in Jupyter-style formatting: source as `string[]`, 1-space JSON indentation, trailing newline
- Tests split by layer:
  - `test/notebook-core.test.ts` covers parse/validation, pure cell ops, formatting helpers, id assignment, load/save roundtrips, save formatting, and fixture-level core behavior
  - `test/notebook-*.tool.test.ts` keeps one file per tool for runner/output/selector behavior
  - `test/notebook-*.workflow.test.ts` keeps one file per multi-step workflow (write→read parity, no-id mutation flow, real-fixture edit/save)
  - current suite passes under `bun test` (67 tests)
- Local tool smoke runner: `bun run tool -- <tool-name> '<json-args>'` prints raw tool text output without launching Pi.
- Biome config lives in `biome.json`.
  - schema migrated to match installed CLI `2.4.14`
  - formatter enabled with `lineWidth: 140`, LF endings, tabs, no trailing commas, semicolons `asNeeded`, arrow parens `asNeeded`
  - linter enabled with recommended rules
  - excludes `.ipynb`, `node_modules`, `.git`, and `bun.lock`
  - package scripts: `typecheck`, `check`, `lint`, `format`, `format:check`, `biome:check`
- Type-checking now uses the installed `bun-types` package via `tsconfig.json` `types: ["bun-types"]`.
- `tsconfig.json` is stricter now: `lib: ["ES2022"]`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `useUnknownInCatchVariables`, plus casing/interop/json-module checks.

## Decisions

- Package form: root-level Pi package, not only project-local `.pi/extensions`.
- Keep notebook operations in pure functions, extension glue thin.
- Start with small tool slices: read-only first, then mutation tools.
- No extra runtime deps for notebook parsing; use built-in JSON handling.

## Gaps

- Pi/manual verification is still light; most verification so far is tests plus local `bun run tool` smoke runs on real fixtures.
- `check` now runs type-checking plus Biome (`bun run typecheck && bun run biome:check`).
- `bun-types` is now installed and type-checking uses it directly.
- Notebook parse/summary/mutation code now satisfies stricter TS + current Biome without non-null assertions.
- Validation errors from Pi surface raw schema-validator messages instead of friendly allowed-value hints.
- Save/mutation path still normalizes notebook JSON shape/format on write, even though it now aims to match common Jupyter formatting.
- Mutation tools on no-id notebooks now rely on index selectors until ids are persisted; read-only id-based addressing is intentionally unavailable in that state.
- Real notebook fixtures live in `test/fixtures/`.
- `PLAN.md` now holds the main actionable planning for adding VSCode/Jupyter-backed notebook execution through a same-repo companion bridge extension.
- Path normalization, mutation queueing, and mutation orchestration helper all implemented.
- `readCellsById` and `readCellRange` removed from public interface.
