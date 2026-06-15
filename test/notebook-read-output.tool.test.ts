import { expect, test } from "bun:test"
import { runNotebookReadOutput } from "../extensions/notebook/tools"
import { FIXTURE_DIR } from "./helpers"
import { join } from "node:path"

test("runNotebookReadOutput uses 1-based output indices", async () => {
	const path = join(FIXTURE_DIR, "lovely-history.ipynb")
	const result = await runNotebookReadOutput({ path, index: 5, outputIndex: 1, mime: "text/plain" })

	expect(result.content[0]?.text).toBe("tensor(10, device='cuda:0')")
	expect(result.details).toMatchObject({ cellIndex: 5, outputIndex: 1 })
	await expect(runNotebookReadOutput({ path, index: 5, outputIndex: 0 })).rejects.toThrow("Output index out of range: 0")
})
