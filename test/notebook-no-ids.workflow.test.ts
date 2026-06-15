import { expect, test } from "bun:test"
import { loadNotebook } from "../extensions/notebook/notebook"
import {
	runNotebookEditCell,
	runNotebookInsert,
	runNotebookMove,
	runNotebookReadCell,
	runNotebookWriteCell
} from "../extensions/notebook/tools"
import { copyFixture } from "./helpers"

test("no-id notebook can be mutated across tools after id assignment", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		await runNotebookWriteCell({ path: fixture.path, index: 1, source: "# %matplotlib widget\n" })
		await runNotebookEditCell({
			path: fixture.path,
			index: 2,
			edits: [{ oldText: "import numpy as np", newText: "import numpy as numpy" }]
		})
		const insertResult = await runNotebookInsert({
			path: fixture.path,
			index: 1,
			direction: "after",
			type: "markdown",
			source: "Inserted note\n"
		})
		const inserted = insertResult.details as { id: string }
		await runNotebookMove({ path: fixture.path, cellId: inserted.id, targetIndex: -1, direction: "after" })

		const saved = await loadNotebook(fixture.path)
		expect(saved.nbformat_minor).toBe(5)
		expect(saved.cells.every(cell => typeof cell.id === "string")).toBe(true)

		expect((await runNotebookReadCell({ path: fixture.path, index: 1 })).content[0]?.text).toContain("# %matplotlib widget")
		expect((await runNotebookReadCell({ path: fixture.path, index: 2 })).content[0]?.text).toContain("import numpy as numpy")
		expect(saved.cells.some(cell => cell.id === inserted.id)).toBe(true)
	} finally {
		await fixture.cleanup()
	}
})
