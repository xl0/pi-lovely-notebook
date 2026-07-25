import { expect, test } from "bun:test"
import { editCellSource, loadNotebook, saveNotebook } from "../src/notebook"
import { copyFixture, readCellById } from "./helpers"

test("reads and edits a real fixture cell while preserving outputs", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const notebook = await loadNotebook(fixture.path)
		const target = readCellById(notebook, "95cca932")
		expect(target.source).toContain('t = torch.tensor(10, device="cuda")')

		editCellSource(notebook, 4, [{ oldText: 'tensor(10, device="cuda")', newText: 'tensor(11, device="cuda")' }])
		await saveNotebook(fixture.path, notebook)

		const updated = await loadNotebook(fixture.path)
		expect(readCellById(updated, "95cca932").source).toContain('tensor(11, device="cuda")')
		expect(updated.cells[4]?.outputs).toEqual(notebook.cells[4]?.outputs)
	} finally {
		await fixture.cleanup()
	}
})
