import { expect, test } from "bun:test"
import { runNotebookDelete, runNotebookReadCell } from "../extensions/notebook/tools"
import { copyFixture, escapeForRegex } from "./helpers"

test("runNotebookDelete returns concise confirmation and removes the cell", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const result = await runNotebookDelete({ path: fixture.path, cellId: "95cca932" })
		expect(result.content[0]?.text).toBe(`Deleted cell 95cca932 from ${fixture.path}.`)
		await expect(runNotebookReadCell({ path: fixture.path, cellId: "95cca932" })).rejects.toThrow("Cell not found: 95cca932")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookDelete works by index on notebooks without ids", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		const result = await runNotebookDelete({ path: fixture.path, index: 1 })
		expect(result.content[0]?.text).toMatch(
			new RegExp(`^Deleted cell index 1 from ${escapeForRegex(fixture.path)}\\.\\nAssigned ids in .*: 1=[0-9a-f]{8} 2=[0-9a-f]{8}$`)
		)
		await expect(runNotebookReadCell({ path: fixture.path, index: 1 })).resolves.toMatchObject({
			content: [{ type: "text", text: expect.any(String) }]
		})
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookDelete fails on missing cell id", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		await expect(runNotebookDelete({ path: fixture.path, cellId: "missing" })).rejects.toThrow("Cell not found: missing")
	} finally {
		await fixture.cleanup()
	}
})
