import { expect, test } from "bun:test"
import { join } from "node:path"
import { notebookReadCellAttachmentTool } from "../src/tools"
import { FIXTURE_DIR } from "./helpers"

test("runNotebookReadCellAttachment returns raw attachment images", async () => {
	const result = await notebookReadCellAttachmentTool.run({
		path: join(FIXTURE_DIR, "subtly-corrupt-images.ipynb"),
		cellId: "corrupt-attachment",
		key: "corrupt.png"
	})
	expect(result).toHaveLength(1)
	expect(result[0]?.type).toBe("image")
	expect(result[0]?.type === "image" && result[0].mimeType).toBe("image/png")
})
