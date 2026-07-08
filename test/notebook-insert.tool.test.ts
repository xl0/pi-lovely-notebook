import { expect, test } from "bun:test"
import { loadNotebook } from "../extensions/notebook/notebook"
import { runNotebookInsert, runNotebookReadCell } from "../extensions/notebook/tools"
import { copyFixture, createTempNotebook } from "./helpers"

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
		const inserted = result.details as { id?: string; index: number }
		expect(inserted.id).toBeUndefined()
		expect(result.content[0]?.text).toBe(`Inserted cell index 2 after index 1 in ${fixture.path}.`)
		expect((await runNotebookReadCell({ path: fixture.path, index: inserted.index })).content[0]?.text).toBe("print(123)\n")
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

		const inserted = result.details as { id?: string; index: number }
		expect(result.content[0]?.text).toBe(`Inserted cell index ${inserted.index} at the end in ${fixture.path}.`)
		const saved = await loadNotebook(fixture.path)
		expect(saved.cells).toHaveLength(1)
		expect(saved.cells[0]?.id).toBeUndefined()
		expect(saved.cells[0]?.source).toEqual(["print(1)\n"])
	} finally {
		await fixture.cleanup()
	}
})
