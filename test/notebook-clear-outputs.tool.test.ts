import { expect, test } from "bun:test"
import { loadNotebook, readAllCells } from "../extensions/notebook/notebook"
import { runNotebookClearOutputs, runNotebookSummary } from "../extensions/notebook/tools"
import { copyFixture, escapeForRegex } from "./helpers"

test("runNotebookClearOutputs returns concise confirmation and clears outputs", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const result = await runNotebookClearOutputs({ path: fixture.path, cellId: "95cca932" })
		expect(result.content[0]?.text).toBe(`Cleared outputs for cell 95cca932 in ${fixture.path}.`)
		const summary = await runNotebookSummary({ path: fixture.path })
		expect(summary.content[0]?.text).toContain('<cell index="5" id="95cca932" type="code" lines="3" outputs="0" />')
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookClearOutputs works by index on notebooks without ids and preserves execution count", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		const result = await runNotebookClearOutputs({ path: fixture.path, index: 2 })
		expect(result.content[0]?.text).toMatch(
			new RegExp(
				`^Cleared outputs for cell index 2 in ${escapeForRegex(fixture.path)}\\.\\nAssigned ids in .*: 1=[0-9a-f]{8} 2=[0-9a-f]{8}$`
			)
		)
		const saved = await loadNotebook(fixture.path)
		expect(readAllCells(saved)[1]?.executionCount).toBe(2)
		const summary = await runNotebookSummary({ path: fixture.path })
		expect(summary.content[0]?.text).toContain('<cell index="2" id="')
		expect(summary.content[0]?.text).toContain('n_exec="2" outputs="0"')
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookClearOutputs fails on markdown cells", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		await expect(runNotebookClearOutputs({ path: fixture.path, cellId: "20735603" })).rejects.toThrow("Cell is not code: 20735603")
	} finally {
		await fixture.cleanup()
	}
})
