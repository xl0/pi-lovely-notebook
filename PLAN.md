# Plan

Done: file-oriented notebook tools (summary, read, edit, structural mutation, outputs,
attachments) over a shared core, shipped as a Pi extension and a stdio MCP server.

Next: execution. Pi should run cells of notebooks the user already has open in VSCode, using the
kernel VSCode already selected — through a narrow companion VSCode extension in this repo, not by
implementing Jupyter kernel/session management inside Pi.

Why: VSCode/Jupyter owns the live document, kernel selection, dirty state, output UI and
interactive execution semantics. Bridging to that is cheap; reimplementing it is not.
Execution is a Pi-only concern — MCP hosts bring their own IDE execution, so the MCP server
stays file-only.

## Ground rules

- Keep the seams: `packages/core/src/notebook.ts` stays pure notebook JSON (no kernel code),
  `packages/core/src/tools.ts` stays the runner/test seam,
  `packages/pi/extensions/notebook/index.ts` stays the Pi adapter seam.
- Bridge lives here as another `packages/*`, exposing a narrow purpose-built RPC surface —
  not generic VSCode APIs.
- Execution goes through the same path normalization and per-file queue as mutation, since it
  can save the file.
- Fail honestly ("notebook not open in VSCode") rather than pretend Pi has kernel state.

## [ ] Protocol and open decisions

Shared request/response types in their own package. VSCode side publishes connection info + token
to a discoverable file under the project (current guess: `.pi/notebook-vscode-bridge.json`); Pi
reads it and calls the bridge. Methods: `health`, `listOpenNotebooks`, `executeCell`, `executeAll`,
maybe a separate `saveNotebook`.

Settle before writing code: transport (localhost HTTP vs unix socket); token generation/storage;
behavior when the VSCode document is dirty or structurally diverged from disk, which decides
whether `cellId` can be mapped to an index at all. ADRs needed for the same-repo companion
extension and for VSCode-owned execution semantics.

## [ ] Pi-side execution tools

`notebook_execute_cell({ path, cellId?|index?, saveAfter? })` and
`notebook_execute_all({ path, saveAfter? })`, backed by a bridge discovery/client module under
`packages/pi/extensions/notebook/`. `saveAfter` defaults true so the existing disk-based tools can
read outputs afterwards. Prompt guidelines must state the VSCode requirement.

## [ ] VSCode bridge package

Activation, local RPC server with token auth, connection file written on activate and removed on
deactivate, notebook adapter over the VSCode Notebook API, optional save after execution. Handlers
depend on a `NotebookHost` interface rather than `vscode` globals so they are testable with a fake.
Execute by index first; by cell id only if VSCode exposes stable ipynb ids, otherwise document the
limitation.

## [ ] Tests

Protocol unit tests. Pi client tests against a mock bridge server and a temp connection file
covering missing file, auth/server failure, notebook-not-open, success. Handler tests with a fake
`NotebookHost`. One activation/server smoke test via `@vscode/test-electron`. Real VSCode+Jupyter
execution stays a documented manual smoke test until the semantics stabilize. Keep `bun test` and
`bun run check` green.

## [ ] Docs

Update `CODE.md` once bridge files exist. Document the companion extension's install/dev flow and
the execution limitations.

## Not doing

Persistent Jupyter kernels inside Pi. A generic VSCode API bridge. Replacing the disk-based
notebook tools. Automated end-to-end kernel execution tests before the bridge stabilizes.
