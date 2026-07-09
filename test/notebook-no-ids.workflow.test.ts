import { expect, test } from "bun:test"
import { loadNotebook } from "../extensions/notebook/notebook"
import {
	notebookEditCellTool,
	notebookInsertTool,
	notebookMoveTool,
	notebookReadCellTool,
	notebookWriteCellTool
} from "../extensions/notebook/tools"
import { copyFixture, firstText } from "./helpers"

test("no-id notebook can be mutated by index without id assignment", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		await notebookWriteCellTool.run({ path: fixture.path, index: 0, source: "# %matplotlib widget\n" })
		await notebookEditCellTool.run({
			path: fixture.path,
			index: 1,
			edits: [{ oldText: "import numpy as np", newText: "import numpy as numpy" }]
		})
		await notebookInsertTool.run({
			path: fixture.path,
			index: 0,
			direction: "after",
			type: "markdown",
			source: "Inserted note\n"
		})
		await notebookMoveTool.run({ path: fixture.path, index: 1, targetIndex: 2, direction: "after" })

		const saved = await loadNotebook(fixture.path)
		expect(saved.nbformat_minor).toBe(2)
		expect(saved.cells.every(cell => cell.id === undefined)).toBe(true)

		expect(firstText(await notebookReadCellTool.run({ path: fixture.path, index: 0 }))).toContain("# %matplotlib widget")
		expect(firstText(await notebookReadCellTool.run({ path: fixture.path, index: 1 }))).toContain("import numpy as numpy")
		expect(firstText(await notebookReadCellTool.run({ path: fixture.path, index: 2 }))).toBe("Inserted note\n")
	} finally {
		await fixture.cleanup()
	}
})
