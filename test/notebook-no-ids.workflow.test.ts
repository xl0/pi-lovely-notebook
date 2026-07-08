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

test("no-id notebook can be mutated by index without id assignment", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		await runNotebookWriteCell({ path: fixture.path, index: 1, source: "# %matplotlib widget\n" })
		await runNotebookEditCell({
			path: fixture.path,
			index: 2,
			edits: [{ oldText: "import numpy as np", newText: "import numpy as numpy" }]
		})
		await runNotebookInsert({
			path: fixture.path,
			index: 1,
			direction: "after",
			type: "markdown",
			source: "Inserted note\n"
		})
		await runNotebookMove({ path: fixture.path, index: 2, targetIndex: -1, direction: "after" })

		const saved = await loadNotebook(fixture.path)
		expect(saved.nbformat_minor).toBe(2)
		expect(saved.cells.every(cell => cell.id === undefined)).toBe(true)

		expect((await runNotebookReadCell({ path: fixture.path, index: 1 })).content[0]?.text).toContain("# %matplotlib widget")
		expect((await runNotebookReadCell({ path: fixture.path, index: 2 })).content[0]?.text).toContain("import numpy as numpy")
		expect((await runNotebookReadCell({ path: fixture.path, index: 3 })).content[0]?.text).toBe("Inserted note\n")
	} finally {
		await fixture.cleanup()
	}
})
