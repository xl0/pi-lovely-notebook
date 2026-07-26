import { expect, test } from "bun:test"
import { loadNotebook } from "../src/notebook"
import { notebookClearOutputsTool, notebookSummaryTool } from "../src/tools"
import { copyFixture, firstText, readAllCells } from "./helpers"

test("runNotebookClearOutputs returns concise confirmation and clears outputs", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const result = await notebookClearOutputsTool.run({ path: fixture.path, cellId: "95cca932" })
		expect(firstText(result)).toBe(`Cleared outputs for cell 95cca932 in ${fixture.path}.`)
		const summary = await notebookSummaryTool.run({ path: fixture.path })
		expect(firstText(summary)).toContain('<cell index="4" id="95cca932" type="code" lines="3" outputs="0">')
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookClearOutputs works by index on notebooks without ids and preserves execution count", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		const result = await notebookClearOutputsTool.run({ path: fixture.path, index: 1 })
		expect(firstText(result)).toBe(`Cleared outputs for cell index 1 in ${fixture.path}.`)
		const saved = await loadNotebook(fixture.path)
		expect(readAllCells(saved)[1]?.executionCount).toBe(2)
		const summary = await notebookSummaryTool.run({ path: fixture.path })
		expect(firstText(summary)).toContain('<cell index="1" type="code"')
		expect(firstText(summary)).toContain('n_exec="2" outputs="0"')
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookClearOutputs fails on markdown cells", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		await expect(notebookClearOutputsTool.run({ path: fixture.path, cellId: "20735603" })).rejects.toThrow("Cell is not code: index 0")
	} finally {
		await fixture.cleanup()
	}
})
