import { expect, test } from "bun:test"
import { notebookMergeTool, notebookReadCellTool } from "../extensions/notebook/tools"
import { copyFixture, firstText } from "./helpers"

test("runNotebookMerge returns concise confirmation and merged source", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const result = await notebookMergeTool.run({ path: fixture.path, cellId: "ffd208cf", direction: "below" })
		expect(firstText(result)).toBe(`Merged cell 95cca932 into ffd208cf in ${fixture.path}.`)
		const readResult = await notebookReadCellTool.run({ path: fixture.path, cellId: "ffd208cf" })
		expect(firstText(readResult)).toContain("torch.cuda.memory_allocated()\n# |eval: false")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookMerge works by index on notebooks without ids", async () => {
	const fixture = await copyFixture("lovely-test-no-ids.ipynb")

	try {
		const result = await notebookMergeTool.run({ path: fixture.path, index: 0, direction: "below" })
		expect(firstText(result)).toBe(`Merged cell index 1 into index 0 in ${fixture.path}.`)
		const readResult = await notebookReadCellTool.run({ path: fixture.path, index: 0 })
		expect(firstText(readResult)).toContain("# %matplotlib inline\n#!/usr/bin/env python3")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookMerge fails at notebook boundaries", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		await expect(notebookMergeTool.run({ path: fixture.path, cellId: "20735603", direction: "above" })).rejects.toThrow(
			"No cell to merge above from index 0"
		)
	} finally {
		await fixture.cleanup()
	}
})
