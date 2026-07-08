import { expect, test } from "bun:test"
import { join } from "node:path"
import { runNotebookReadCellAttachment } from "../extensions/notebook/tools"
import { FIXTURE_DIR } from "./helpers"

test("runNotebookReadCellAttachment omits subtly corrupted attachments", async () => {
	const result = await runNotebookReadCellAttachment({
		path: join(FIXTURE_DIR, "subtly-corrupt-images.ipynb"),
		cellId: "corrupt-attachment",
		key: "corrupt.png"
	})
	expect(result.content).toEqual([{ type: "text", text: "[Image omitted: could not be resized below the inline image size limit.]" }])
})
