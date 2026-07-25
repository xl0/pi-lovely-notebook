import { expect, test } from "bun:test"
import { loadNotebook } from "../src/notebook"
import { notebookEditCellTool } from "../src/tools"
import { copyFixture, firstText, readAllCells } from "./helpers"

test("runNotebookEditCell works by index on notebooks without ids", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		const result = await notebookEditCellTool.run({
			path: fixture.path,
			index: 1,
			edits: [{ oldText: "import numpy as np", newText: "import numpy as numpy" }]
		})
		expect(firstText(result)).toContain(`Successfully replaced 1 block(s) in cell index 1 of ${fixture.path}.`)
		const saved = await loadNotebook(fixture.path)
		expect(saved.cells[0]?.id).toBeUndefined()
		expect(saved.cells[1]?.id).toBeUndefined()
		expect(readAllCells(await loadNotebook(fixture.path))[1]?.source).toContain("import numpy as numpy")
	} finally {
		await fixture.cleanup()
	}
})
