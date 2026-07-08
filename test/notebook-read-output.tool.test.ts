import { expect, test } from "bun:test"
import { join } from "node:path"
import { runNotebookReadOutput } from "../extensions/notebook/tools"
import { FIXTURE_DIR } from "./helpers"

test("runNotebookReadOutput uses 1-based output indices", async () => {
	const path = join(FIXTURE_DIR, "lovely-history.ipynb")
	const result = await runNotebookReadOutput({ path, index: 5, outputIndex: 1, mime: "text/plain" })

	expect(result.content[0]?.text).toBe("tensor(10, device='cuda:0')")
	expect(result.details).toMatchObject({ cellIndex: 5, outputIndex: 1 })
	await expect(runNotebookReadOutput({ path, index: 5, outputIndex: 0 })).rejects.toThrow("Output index out of range: 0")
})

test("runNotebookReadOutput omits subtly corrupted image outputs", async () => {
	const result = await runNotebookReadOutput({
		path: join(FIXTURE_DIR, "subtly-corrupt-images.ipynb"),
		cellId: "corrupt-output",
		outputIndex: 1,
		mime: "image/png"
	})
	expect(result.content).toEqual([{ type: "text", text: "[Image omitted: could not be resized below the inline image size limit.]" }])
})
