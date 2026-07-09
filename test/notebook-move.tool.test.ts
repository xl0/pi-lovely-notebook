import { expect, test } from "bun:test"
import { loadNotebook } from "../extensions/notebook/notebook"
import { notebookMoveTool, notebookReadCellTool } from "../extensions/notebook/tools"
import { copyFixture, firstText } from "./helpers"

test("runNotebookMove returns concise confirmation and reorders cells", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const result = await notebookMoveTool.run({ path: fixture.path, cellId: "95cca932", targetCellId: "57d6942b", direction: "after" })
		expect(firstText(result)).toBe(`Moved cell 95cca932 after 57d6942b in ${fixture.path}.`)
		const saved = await loadNotebook(fixture.path)
		expect(saved.cells[2]?.id).toBe("95cca932")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookMove works by index on notebooks without ids", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		const result = await notebookMoveTool.run({ path: fixture.path, index: 1, targetIndex: 0, direction: "before" })
		expect(firstText(result)).toBe(`Moved cell index 1 before index 0 in ${fixture.path}.`)
		const readResult = await notebookReadCellTool.run({ path: fixture.path, index: 0 })
		expect(firstText(readResult)).toContain("#!/usr/bin/env python3")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookMove fails on invalid index", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		await expect(notebookMoveTool.run({ path: fixture.path, cellId: "95cca932", targetIndex: 98, direction: "before" })).rejects.toThrow(
			"Cell index out of range: 98"
		)
	} finally {
		await fixture.cleanup()
	}
})
