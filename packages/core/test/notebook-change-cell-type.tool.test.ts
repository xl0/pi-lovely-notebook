import { expect, test } from "bun:test"
import { loadNotebook } from "../src/notebook"
import { notebookChangeCellTypeTool } from "../src/tools"
import { copyFixture, firstText } from "./helpers"

test("runNotebookChangeCellType changes a cell to code", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const result = await notebookChangeCellTypeTool.run({ path: fixture.path, cellId: "9fd3e324", type: "code" })
		expect(firstText(result)).toBe(`Changed cell 9fd3e324 to code in ${fixture.path}.`)

		const saved = await loadNotebook(fixture.path)
		const cell = saved.cells.find(cell => cell.id === "9fd3e324")
		expect(cell?.cell_type).toBe("code")
		expect(cell?.execution_count).toBeNull()
		expect(cell?.outputs).toEqual([])
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookChangeCellType works by index on notebooks without ids", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		const result = await notebookChangeCellTypeTool.run({ path: fixture.path, index: 0, type: "raw" })
		expect(firstText(result)).toBe(`Changed cell index 0 to raw in ${fixture.path}.`)

		const cell = (await loadNotebook(fixture.path)).cells[0]
		expect(cell?.cell_type).toBe("raw")
		expect(cell?.execution_count).toBeUndefined()
		expect(cell?.outputs).toBeUndefined()
	} finally {
		await fixture.cleanup()
	}
})
