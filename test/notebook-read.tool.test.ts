import { expect, test } from "bun:test"
import { join } from "node:path"
import { runNotebookReadCell } from "../extensions/notebook/tools"
import { FIXTURE_DIR } from "./helpers"

test("runNotebookReadCell returns raw cell source", async () => {
	const result = await runNotebookReadCell({ path: join(FIXTURE_DIR, "lovely-history.ipynb"), cellId: "95cca932" })
	expect(result.content[0]?.text).toBe('# |eval: false\nt = torch.tensor(10, device="cuda")\nt')
})

test("runNotebookReadCell supports reading by index and line slice", async () => {
	const result = await runNotebookReadCell({
		path: join(FIXTURE_DIR, "lovely-history.ipynb"),
		index: 5,
		lineOffset: 1,
		lineLimit: 1
	})
	expect(result.content[0]?.text).toBe('t = torch.tensor(10, device="cuda")\n[1 more lines. Use offset=2 to continue.]')
})

test("runNotebookReadCell rejects invalid selectors", async () => {
	await expect(
		runNotebookReadCell({
			path: join(FIXTURE_DIR, "lovely-history.ipynb"),
			cellId: "95cca932",
			index: 5
		})
	).rejects.toThrow("Provide exactly one cell selector: cellId or index")
})

test("runNotebookReadCell fails on missing cell id", async () => {
	await expect(runNotebookReadCell({ path: join(FIXTURE_DIR, "lovely-history.ipynb"), cellId: "missing" })).rejects.toThrow(
		"Cell not found: missing"
	)
})

test("runNotebookReadCell rejects invalid line slices", async () => {
	await expect(runNotebookReadCell({ path: join(FIXTURE_DIR, "lovely-history.ipynb"), index: 5, lineOffset: -1 })).rejects.toThrow(
		"Invalid lineOffset: -1"
	)
	await expect(runNotebookReadCell({ path: join(FIXTURE_DIR, "lovely-history.ipynb"), index: 5, lineLimit: -1 })).rejects.toThrow(
		"Invalid lineLimit: -1"
	)
})
