import { expect, test } from "bun:test"
import { loadNotebook, readAllCells } from "../extensions/notebook/notebook"
import { runNotebookEditCell } from "../extensions/notebook/tools"
import { copyFixture } from "./helpers"

test("runNotebookEditCell works by index on notebooks without ids", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		const result = await runNotebookEditCell({
			path: fixture.path,
			index: 2,
			edits: [{ oldText: "import numpy as np", newText: "import numpy as numpy" }]
		})
		expect(result.content[0]?.text).toContain(`Successfully replaced 1 block(s) in cell index 2 of ${fixture.path}.`)
		expect(result.content[0]?.text).toMatch(/Assigned ids in .*: 1=[0-9a-f]{8} 2=[0-9a-f]{8}$/)
		expect(readAllCells(await loadNotebook(fixture.path))[1]?.source).toContain("import numpy as numpy")
	} finally {
		await fixture.cleanup()
	}
})
