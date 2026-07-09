import { expect, test } from "bun:test"
import { join } from "node:path"
import { notebookReadCellTool } from "../extensions/notebook/tools"
import { FIXTURE_DIR, firstText } from "./helpers"

test("runNotebookReadCell returns raw cell source", async () => {
	const result = await notebookReadCellTool.run({ path: join(FIXTURE_DIR, "lovely-history.ipynb"), cellId: "95cca932" })
	expect(firstText(result)).toBe('# |eval: false\nt = torch.tensor(10, device="cuda")\nt')
})

test("runNotebookReadCell supports reading by index and line slice", async () => {
	const result = await notebookReadCellTool.run({
		path: join(FIXTURE_DIR, "lovely-history.ipynb"),
		index: 4,
		lineOffset: 1,
		lineLimit: 1
	})
	expect(firstText(result)).toBe('t = torch.tensor(10, device="cuda")\n[1 more lines. Use offset=2 to continue.]')
})

test("runNotebookReadCell rejects invalid selectors", async () => {
	await expect(
		notebookReadCellTool.run({
			path: join(FIXTURE_DIR, "lovely-history.ipynb"),
			cellId: "95cca932",
			index: 4
		})
	).rejects.toThrow("Provide exactly one cell selector: cellId or index")
})

test("runNotebookReadCell fails on missing cell id", async () => {
	await expect(notebookReadCellTool.run({ path: join(FIXTURE_DIR, "lovely-history.ipynb"), cellId: "missing" })).rejects.toThrow(
		"Cell not found: missing"
	)
})

test("runNotebookReadCell rejects invalid line slices", async () => {
	await expect(notebookReadCellTool.run({ path: join(FIXTURE_DIR, "lovely-history.ipynb"), index: 4, lineOffset: -1 })).rejects.toThrow(
		"Invalid lineOffset: -1"
	)
	await expect(notebookReadCellTool.run({ path: join(FIXTURE_DIR, "lovely-history.ipynb"), index: 4, lineLimit: -1 })).rejects.toThrow(
		"Invalid lineLimit: -1"
	)
})

test("runNotebookReadCell omits subtly corrupted inline images", async () => {
	const result = await notebookReadCellTool.run({ path: join(FIXTURE_DIR, "subtly-corrupt-images.ipynb"), cellId: "corrupt-md" })
	expect(firstText(result)).toContain("![corrupt png]([image: image/png])")
	expect(result[1]).toEqual({ type: "text", text: "[Image omitted: could not be resized below the inline image size limit.]" })
})

test("runNotebookReadCell can omit inline image content", async () => {
	const result = await notebookReadCellTool.run({
		path: join(FIXTURE_DIR, "subtly-corrupt-images.ipynb"),
		cellId: "corrupt-md",
		includeImages: false
	})
	expect(firstText(result)).toContain("![corrupt png]([image: image/png])")
	expect(result).toHaveLength(1)
})
