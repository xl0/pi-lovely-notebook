import { expect, test } from "bun:test"
import { runNotebookMerge, runNotebookReadCell } from "../extensions/notebook/tools"
import { copyFixture, escapeForRegex } from "./helpers"

test("runNotebookMerge returns concise confirmation and merged source", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const result = await runNotebookMerge({ path: fixture.path, cellId: "ffd208cf", direction: "below" })
		expect(result.content[0]?.text).toBe(`Merged cell 95cca932 into ffd208cf in ${fixture.path}.`)
		const readResult = await runNotebookReadCell({ path: fixture.path, cellId: "ffd208cf" })
		expect(readResult.content[0]?.text).toContain("torch.cuda.memory_allocated()\n# |eval: false")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookMerge works by index on notebooks without ids", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		const result = await runNotebookMerge({ path: fixture.path, index: 1, direction: "below" })
		expect(result.content[0]?.text).toMatch(
			new RegExp(
				`^Merged cell [0-9a-f]{8} into index 1 in ${escapeForRegex(fixture.path)}\\.\\nAssigned ids in .*: 1=[0-9a-f]{8} 2=[0-9a-f]{8}$`
			)
		)
		const readResult = await runNotebookReadCell({ path: fixture.path, index: 1 })
		expect(readResult.content[0]?.text).toContain("# %matplotlib inline\n#!/usr/bin/env python3")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookMerge fails at notebook boundaries", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		await expect(runNotebookMerge({ path: fixture.path, cellId: "20735603", direction: "above" })).rejects.toThrow(
			"No cell to merge above from 20735603"
		)
	} finally {
		await fixture.cleanup()
	}
})
