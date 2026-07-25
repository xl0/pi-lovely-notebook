import { expect, test } from "bun:test"
import { notebookDeleteTool, notebookReadCellTool } from "../src/tools"
import { copyFixture, firstText } from "./helpers"

test("runNotebookDelete returns concise confirmation and removes the cell", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const result = await notebookDeleteTool.run({ path: fixture.path, cellId: "95cca932" })
		expect(firstText(result)).toBe(`Deleted cell 95cca932 from ${fixture.path}.`)
		await expect(notebookReadCellTool.run({ path: fixture.path, cellId: "95cca932" })).rejects.toThrow("Cell not found: 95cca932")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookDelete works by index on notebooks without ids", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		const result = await notebookDeleteTool.run({ path: fixture.path, index: 0 })
		expect(firstText(result)).toBe(`Deleted cell index 0 from ${fixture.path}.`)
		expect(firstText(await notebookReadCellTool.run({ path: fixture.path, index: 0 }))).toEqual(expect.any(String))
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookDelete fails on missing cell id", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		await expect(notebookDeleteTool.run({ path: fixture.path, cellId: "missing" })).rejects.toThrow("Cell not found: missing")
	} finally {
		await fixture.cleanup()
	}
})
