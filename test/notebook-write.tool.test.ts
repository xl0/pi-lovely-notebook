import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { loadNotebook } from "../extensions/notebook/notebook"
import { notebookReadCellTool, notebookWriteCellTool } from "../extensions/notebook/tools"
import { copyFixture, firstText } from "./helpers"

test("runNotebookWriteCell returns concise confirmation", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const result = await notebookWriteCellTool.run({ path: fixture.path, cellId: "95cca932", source: "x\n" })
		expect(firstText(result)).toBe(`Wrote cell 95cca932 in ${fixture.path}.`)
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookWriteCell fails on missing cell id", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		await expect(notebookWriteCellTool.run({ path: fixture.path, cellId: "missing", source: "x" })).rejects.toThrow(
			"Cell not found: missing"
		)
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookWriteCell writes by index on notebooks without ids", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		const writeResult = await notebookWriteCellTool.run({ path: fixture.path, index: 0, source: "# %matplotlib widget\n" })
		expect(firstText(writeResult)).toBe(`Wrote cell index 0 in ${fixture.path}.`)
		const saved = await loadNotebook(fixture.path)
		expect(saved.nbformat_minor).toBe(2)
		expect(saved.cells[0]?.id).toBeUndefined()
		expect(saved.cells[1]?.id).toBeUndefined()
		expect(saved.cells[0]?.source).toBe("# %matplotlib widget\n")
		expect(Array.isArray(JSON.parse(await readFile(fixture.path, "utf8")).cells[0].source)).toBe(true)

		const result = await notebookReadCellTool.run({ path: fixture.path, index: 0 })
		expect(firstText(result)).toBe("# %matplotlib widget\n")
	} finally {
		await fixture.cleanup()
	}
})
