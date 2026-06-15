import { expect, test } from "bun:test"
import { loadNotebook } from "../extensions/notebook/notebook"
import { runNotebookReadCell, runNotebookWriteCell } from "../extensions/notebook/tools"
import { copyFixture, escapeForRegex } from "./helpers"

test("runNotebookWriteCell returns concise confirmation", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const result = await runNotebookWriteCell({ path: fixture.path, cellId: "95cca932", source: "x\n" })
		expect(result.content[0]?.text).toBe(`Wrote cell 95cca932 in ${fixture.path}.`)
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookWriteCell fails on missing cell id", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		await expect(runNotebookWriteCell({ path: fixture.path, cellId: "missing", source: "x" })).rejects.toThrow("Cell not found: missing")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookWriteCell persists ids and writes by index on notebooks without ids", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		const writeResult = await runNotebookWriteCell({ path: fixture.path, index: 1, source: "# %matplotlib widget\n" })
		expect(writeResult.content[0]?.text).toMatch(
			new RegExp(`^Wrote cell index 1 in ${escapeForRegex(fixture.path)}\\.\\nAssigned ids in .*: 1=[0-9a-f]{8} 2=[0-9a-f]{8}$`)
		)
		const saved = await loadNotebook(fixture.path)
		expect(saved.nbformat_minor).toBe(5)
		expect(saved.cells[0]?.id).toMatch(/^[0-9a-f]{8}$/)
		expect(saved.cells[1]?.id).toMatch(/^[0-9a-f]{8}$/)
		expect(Array.isArray(saved.cells[0]?.source)).toBe(true)

		const result = await runNotebookReadCell({ path: fixture.path, index: 1 })
		expect(result.content[0]?.text).toBe("# %matplotlib widget\n")
	} finally {
		await fixture.cleanup()
	}
})
