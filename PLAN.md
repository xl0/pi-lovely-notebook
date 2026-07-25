# Pi notebook package

## Plan

Add notebook execution through a narrow VSCode companion extension, not by implementing Jupyter kernel/session management inside the Pi extension.

The existing Pi package remains the file-oriented notebook tool layer: summarize, read, edit, structural mutation, output/attachment reads. Execution becomes a bridge-backed capability because VSCode/Jupyter owns the live notebook document, selected kernel, dirty state, output UI, and interactive execution semantics.

Initial target: execute open VSCode notebooks/cells through the currently selected VSCode Jupyter kernel, optionally save after execution so Pi's existing disk-based tools can inspect outputs.

## Constraints / decisions

- Keep `packages/pi/extensions/notebook/index.ts` as the Pi adapter seam.
- Keep `packages/core/src/tools.ts` as the runner/test seam.
- Keep pure notebook JSON operations in `packages/core/src/notebook.ts`; do not mix kernel execution into that module.
- Add the VSCode bridge in this repo as another workspace package (`packages/*`), not a separate repo yet.
- Bridge-backed execution is a Pi concern; the MCP server stays file-only (MCP hosts like Claude Code bring their own kernel execution via IDE integration).
- Do not expose generic VSCode APIs. The bridge should provide a narrow, purpose-built RPC surface.
- Pi still normalizes notebook paths and queues per-file mutations/execution calls.
- VSCode bridge should execute using the currently selected VSCode/Jupyter kernel.
- Prefer explicit bridge-backed execution semantics over pretending Pi has access to live kernel state.
- Keep dependency freedom: VSCode extension deps and test deps are allowed when needed.

## Proposed repo layout

```txt
packages/core/                       # @xl0/lovely-notebook: shared published core (done)
packages/pi/                         # @xl0/pi-lovely-notebook: Pi adapter (done)
  extensions/notebook/index.ts       # register tools, rendering, resize, queueing
  extensions/notebook/vscode-bridge.ts  # (planned) Pi-side bridge discovery/client
packages/mcp/                        # @xl0/lovely-notebook-mcp: local stdio MCP server (done)

packages/bridge-protocol/            # (planned) request/response types/constants

packages/vscode-bridge/              # (planned)
  src/extension.ts                   # VSCode activation
  src/server.ts                      # local RPC/auth/router
  src/handlers.ts                    # testable orchestration
  src/notebooks.ts                   # thin VSCode Notebook API adapter
```

## Bridge shape

Connection:

- VSCode extension starts a localhost or Unix-socket RPC server.
- It writes connection info + token to a discoverable file, likely `.pi/notebook-vscode-bridge.json` under the workspace/project.
- Pi tools read that file and call the bridge.

Initial RPC methods:

- `health`
- `listOpenNotebooks`
- `executeCell(path, cellId? | index?, saveAfter?)`
- `executeAll(path, saveAfter?)`
- maybe `saveNotebook(path)` if execution and save should stay separate

Initial Pi tools:

- `notebook_execute_cell({ path, cellId?|index?, saveAfter? })`
- `notebook_execute_all({ path, saveAfter? })`

Likely semantics:

- notebook must be open in VSCode, or bridge returns a clear error
- execution uses VSCode's current kernel for that notebook
- outputs appear in VSCode
- `saveAfter` defaults to true so disk-based Pi tools can read outputs after execution
- if notebook is dirty, execute the in-memory VSCode document, then save when `saveAfter` is true
- selectors should prefer VSCode-visible cell identity if available; otherwise Pi may map `cellId -> index` from disk only when the document is not structurally dirty

## Testing strategy

Use three layers:

1. Pure protocol/unit tests
   - shared request/response parsing
   - token/auth behavior
   - path/URI normalization helpers
   - selector validation
   - error/result shape

2. Pi-side bridge client tests
   - start a mock local bridge server
   - write temp bridge connection file
   - call Pi runner functions
   - assert request body, auth, response formatting, failure modes
   - no VSCode dependency

3. VSCode extension tests
   - unit-test `handlers.ts` with a fake `NotebookHost`
   - light VSCode integration tests for activation/server/notebook discovery using `@vscode/test-electron`
   - keep full VSCode+Jupyter kernel execution as manual/smoke first; automate later only if stable enough

Design for testability:

```ts
interface NotebookHost {
  listOpenNotebooks(): NotebookRef[]
  executeCell(path: string, selector: Selector): Promise<ExecutionResult>
  executeAll(path: string): Promise<ExecutionResult>
  save(path: string): Promise<void>
}
```

RPC handlers should depend on `NotebookHost`, not directly on `vscode` globals.

## Todo

### P0. Design/protocol

- [ ] Define bridge protocol request/response types in `shared/notebook-bridge-protocol.ts`.
- [ ] Decide connection file path and schema.
- [ ] Decide RPC transport: localhost HTTP vs Unix socket.
- [ ] Decide auth token generation/storage.
- [ ] Decide exact dirty-notebook behavior.
- [ ] Decide selector semantics for `cellId` when VSCode document differs from disk.
- [ ] Add/update ADR for same-repo VSCode companion extension.
- [ ] Add/update ADR for VSCode/Jupyter-owned execution semantics.

### P1. Pi-side execution tools

- [ ] Add Pi-side bridge discovery/client module under `packages/pi/extensions/notebook/`.
- [ ] Add `notebook_execute_all` schema + runner.
- [ ] Add `notebook_execute_cell` schema + runner.
- [ ] Register execution tools in `packages/pi/extensions/notebook/index.ts`.
- [ ] Normalize paths at adapter seam before bridge calls.
- [ ] Wrap execution calls in `withFileMutationQueue(path, ...)` because execution may save/mutate `.ipynb`.
- [ ] Add prompt snippets/guidelines describing VSCode bridge requirement and `saveAfter` behavior.

### P2. VSCode bridge package

- [ ] Create `packages/vscode-bridge/` package scaffold.
- [ ] Implement VSCode activation/deactivation.
- [ ] Implement local RPC server and token auth.
- [ ] Write/remove connection file on activate/deactivate.
- [ ] Implement `NotebookHost` adapter using VSCode Notebook APIs.
- [ ] Implement `health` and `listOpenNotebooks`.
- [ ] Implement `executeAll`.
- [ ] Implement `executeCell` by index.
- [ ] Implement `executeCell` by cell id if VSCode exposes stable ipynb cell ids; otherwise document limitations.
- [ ] Implement optional save-after-execution.

### P3. Tests

- [ ] Add shared protocol unit tests.
- [ ] Add Pi bridge-client mock-server tests.
- [ ] Add Pi runner tests for missing bridge file, auth/server failure, notebook-not-open, success response.
- [ ] Add VSCode bridge handler tests with fake `NotebookHost`.
- [ ] Add VSCode activation/server smoke test via `@vscode/test-electron`.
- [ ] Document manual VSCode+Jupyter smoke test.
- [ ] Keep `bun test` and `bun run check` green for existing package.

### P4. Docs/package polish

- [ ] Update `CODE.md` once bridge files exist.
- [ ] Document installation/development flow for the VSCode companion extension.
- [ ] Document execution semantics and limitations.
- [ ] Decide whether root package scripts should proxy VSCode bridge build/test scripts.
- [ ] Decide later whether a monorepo/package-workspace restructure is worth it.

## Non-goals for the first execution pass

- [ ] Do not implement persistent Jupyter kernel sessions inside Pi.
- [ ] Do not implement a generic VSCode API bridge.
- [ ] Do not replace existing disk-based notebook read/write tools.
- [ ] Do not automate full VSCode+Jupyter kernel execution tests until the bridge semantics stabilize.
