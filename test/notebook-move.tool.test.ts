import { expect, test } from "bun:test"
import { loadNotebook } from "../extensions/notebook/notebook"
import { runNotebookMove, runNotebookReadCell } from "../extensions/notebook/tools"
import { copyFixture, escapeForRegex } from "./helpers"

test("runNotebookMove returns concise confirmation and reorders cells", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const result = await runNotebookMove({ path: fixture.path, cellId: "95cca932", targetCellId: "57d6942b", direction: "after" })
		expect(result.content[0]?.text).toBe(`Moved cell 95cca932 after 57d6942b in ${fixture.path}.`)
		const saved = await loadNotebook(fixture.path)
		expect(saved.cells[2]?.id).toBe("95cca932")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookMove works by index on notebooks without ids", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		const result = await runNotebookMove({ path: fixture.path, index: 2, targetIndex: 1, direction: "before" })
		expect(result.content[0]?.text).toMatch(
			new RegExp(
				`^Moved cell index 2 before index 1 in ${escapeForRegex(fixture.path)}\\.\\nAssigned ids in .*: 1=[0-9a-f]{8} 2=[0-9a-f]{8}$`
			)
		)
		const readResult = await runNotebookReadCell({ path: fixture.path, index: 1 })
		expect(readResult.content[0]?.text).toContain("#!/usr/bin/env python3")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookMove fails on invalid index", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		await expect(runNotebookMove({ path: fixture.path, cellId: "95cca932", targetIndex: 99, direction: "before" })).rejects.toThrow(
			"Cell index out of range: 99"
		)
	} finally {
		await fixture.cleanup()
	}
})
