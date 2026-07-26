import { expect, test } from "bun:test"
import { loadNotebook } from "../src/notebook"
import { notebookMergeTool, notebookReadCellTool } from "../src/tools"
import { copyFixture, createTempNotebook, firstText } from "./helpers"

function markdownWithAttachments(secondKey: string, secondData: string) {
	return JSON.stringify({
		nbformat: 4,
		nbformat_minor: 5,
		cells: [
			{
				cell_type: "markdown",
				id: "top",
				source: ["![a](attachment:a.png)\n"],
				attachments: { "a.png": { "image/png": "AAAA" } }
			},
			{
				cell_type: "markdown",
				id: "bottom",
				source: [`![b](attachment:${secondKey})\n`],
				attachments: { [secondKey]: { "image/png": secondData } }
			}
		]
	})
}

test("runNotebookMerge returns concise confirmation and merged source", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const result = await notebookMergeTool.run({ path: fixture.path, cellId: "ffd208cf", direction: "below" })
		expect(firstText(result)).toBe(
			`Merged cell 95cca932 into ffd208cf in ${fixture.path}. Dropped 1 output(s) that belonged to the removed cell.`
		)
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
		expect(firstText(result)).toBe(
			`Merged cell index 1 into index 0 in ${fixture.path}. Dropped 1 output(s) that belonged to the removed cell.`
		)
		const readResult = await notebookReadCellTool.run({ path: fixture.path, index: 0 })
		expect(firstText(readResult)).toContain("# %matplotlib inline\n#!/usr/bin/env python3")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookMerge keeps the attachments of both cells", async () => {
	const fixture = await createTempNotebook("attachments.ipynb", markdownWithAttachments("b.png", "BBBB"))

	try {
		await notebookMergeTool.run({ path: fixture.path, cellId: "top", direction: "below" })
		const notebook = await loadNotebook(fixture.path)
		expect(notebook.cells).toHaveLength(1)
		// Both `attachment:` references survive in the merged source, so both payloads must too.
		expect(notebook.cells[0]?.attachments).toEqual({ "a.png": { "image/png": "AAAA" }, "b.png": { "image/png": "BBBB" } })
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookMerge refuses colliding attachment keys, allows identical ones", async () => {
	const clashing = await createTempNotebook("clash.ipynb", markdownWithAttachments("a.png", "BBBB"))
	const identical = await createTempNotebook("same.ipynb", markdownWithAttachments("a.png", "AAAA"))

	try {
		await expect(notebookMergeTool.run({ path: clashing.path, cellId: "top", direction: "below" })).rejects.toThrow(
			'Both cells have a different attachment named "a.png"; rename one before merging'
		)
		await notebookMergeTool.run({ path: identical.path, cellId: "top", direction: "below" })
		expect((await loadNotebook(identical.path)).cells[0]?.attachments).toEqual({ "a.png": { "image/png": "AAAA" } })
	} finally {
		await clashing.cleanup()
		await identical.cleanup()
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
