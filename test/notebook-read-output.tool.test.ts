import { expect, test } from "bun:test"
import { join } from "node:path"
import { notebookReadOutputTool } from "../extensions/notebook/tools"
import { FIXTURE_DIR, firstText } from "./helpers"

test("runNotebookReadOutput uses 0-based output indices", async () => {
	const path = join(FIXTURE_DIR, "lovely-history.ipynb")
	const result = await notebookReadOutputTool.run({ path, index: 4, outputIndex: 0, mime: "text/plain" })

	expect(firstText(result)).toBe("tensor(10, device='cuda:0')")
	await expect(notebookReadOutputTool.run({ path, index: 4, outputIndex: -1 })).rejects.toThrow("Output index out of range: -1")
})

test("runNotebookReadOutput omits subtly corrupted image outputs", async () => {
	const result = await notebookReadOutputTool.run({
		path: join(FIXTURE_DIR, "subtly-corrupt-images.ipynb"),
		cellId: "corrupt-output",
		outputIndex: 0,
		mime: "image/png"
	})
	expect(result).toEqual([{ type: "text", text: "[Image omitted: could not be resized below the inline image size limit.]" }])
})

test("runNotebookReadOutput can omit image content", async () => {
	const result = await notebookReadOutputTool.run({
		path: join(FIXTURE_DIR, "subtly-corrupt-images.ipynb"),
		cellId: "corrupt-output",
		outputIndex: 0,
		mime: "image/png",
		includeImages: false
	})
	expect(result).toEqual([{ type: "text", text: "[Images omitted: includeImages=false.]" }])
})
