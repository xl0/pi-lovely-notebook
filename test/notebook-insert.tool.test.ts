import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"
import { loadNotebook } from "../extensions/notebook/notebook"
import { notebookInsertTool, notebookReadCellTool } from "../extensions/notebook/tools"
import { copyFixture, createTempNotebook, firstText } from "./helpers"

test("runNotebookInsert returns concise confirmation and inserts readable cell", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const result = await notebookInsertTool.run({
			path: fixture.path,
			cellId: "95cca932",
			direction: "after",
			type: "markdown",
			source: "Inserted note\n"
		})
		const saved = await loadNotebook(fixture.path)
		const inserted = saved.cells[5]
		if (inserted?.id === undefined) throw new Error("Inserted cell missing id")
		expect(firstText(result)).toBe(`Inserted cell ${inserted.id} after 95cca932 in ${fixture.path}.`)

		const readResult = await notebookReadCellTool.run({ path: fixture.path, cellId: inserted.id })
		expect(firstText(readResult)).toBe("Inserted note\n")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookInsert works by index on notebooks without ids", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		const result = await notebookInsertTool.run({
			path: fixture.path,
			index: 0,
			direction: "after",
			type: "code",
			source: "print(123)\n"
		})
		expect(firstText(result)).toBe(`Inserted cell index 1 after index 0 in ${fixture.path}.`)
		expect(firstText(await notebookReadCellTool.run({ path: fixture.path, index: 1 }))).toBe("print(123)\n")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookInsert fails on ambiguous selector", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		await expect(
			notebookInsertTool.run({
				path: fixture.path,
				cellId: "95cca932",
				index: 4,
				direction: "after",
				type: "markdown",
				source: "x"
			})
		).rejects.toThrow("Provide exactly one cell selector: cellId or index")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookInsert appends with index -1", async () => {
	const fixture = await createTempNotebook("empty.ipynb", '{"cells":[],"metadata":{},"nbformat":4,"nbformat_minor":2}\n')

	try {
		const result = await notebookInsertTool.run({
			path: fixture.path,
			index: -1,
			direction: "after",
			type: "code",
			source: "print(1)\n"
		})

		expect(firstText(result)).toBe(`Inserted cell index 0 at the end in ${fixture.path}.`)
		const saved = await loadNotebook(fixture.path)
		expect(saved.cells).toHaveLength(1)
		expect(saved.cells[0]?.id).toBeUndefined()
		expect(saved.cells[0]?.source).toBe("print(1)\n")
		expect(JSON.parse(await readFile(fixture.path, "utf8")).cells[0].source).toEqual(["print(1)\n"])
	} finally {
		await fixture.cleanup()
	}
})
