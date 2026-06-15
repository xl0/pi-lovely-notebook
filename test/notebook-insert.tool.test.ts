import { expect, test } from "bun:test"
import { loadNotebook, readCellById } from "../extensions/notebook/notebook"
import { runNotebookInsert, runNotebookReadCell } from "../extensions/notebook/tools"
import { copyFixture, createTempNotebook, escapeForRegex } from "./helpers"

test("runNotebookInsert returns concise confirmation and inserts readable cell", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const result = await runNotebookInsert({
			path: fixture.path,
			cellId: "95cca932",
			direction: "after",
			type: "markdown",
			source: "Inserted note\n"
		})
		const inserted = result.details as { id: string }
		expect(result.content[0]?.text).toBe(`Inserted cell ${inserted.id} after 95cca932 in ${fixture.path}.`)

		const readResult = await runNotebookReadCell({ path: fixture.path, cellId: inserted.id })
		expect(readResult.content[0]?.text).toBe("Inserted note\n")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookInsert works by index on notebooks without ids", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		const result = await runNotebookInsert({
			path: fixture.path,
			index: 1,
			direction: "after",
			type: "code",
			source: "print(123)\n"
		})
		const inserted = result.details as { id: string }
		expect(result.content[0]?.text).toMatch(
			new RegExp(
				`^Inserted cell ${inserted.id} after index 1 in ${escapeForRegex(fixture.path)}\\.\\nAssigned ids in .*: 1=[0-9a-f]{8} 2=[0-9a-f]{8}$`
			)
		)
		expect(readCellById(await loadNotebook(fixture.path), inserted.id).source).toBe("print(123)\n")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookInsert fails on ambiguous selector", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		await expect(
			runNotebookInsert({
				path: fixture.path,
				cellId: "95cca932",
				index: 5,
				direction: "after",
				type: "markdown",
				source: "x"
			})
		).rejects.toThrow("Provide exactly one of cellId or index")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookInsert appends with index -1", async () => {
	const fixture = await createTempNotebook("empty.ipynb", '{"cells":[],"metadata":{},"nbformat":4,"nbformat_minor":2}\n')

	try {
		const result = await runNotebookInsert({
			path: fixture.path,
			index: -1,
			direction: "after",
			type: "code",
			source: "print(1)\n"
		})

		const inserted = result.details as { id: string }
		expect(result.content[0]?.text).toBe(`Inserted cell ${inserted.id} at the end in ${fixture.path}.`)
		const saved = await loadNotebook(fixture.path)
		expect(saved.cells).toHaveLength(1)
		expect(saved.cells[0]?.id).toBe(inserted.id)
		expect(saved.cells[0]?.source).toEqual(["print(1)\n"])
	} finally {
		await fixture.cleanup()
	}
})
