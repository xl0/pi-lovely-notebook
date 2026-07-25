import { expect, test } from "bun:test"
import { join } from "node:path"
import { notebookReadCellAttachmentTool } from "@xl0/lovely-notebook"
import { resolveContentImages } from "../extensions/notebook"

const FIXTURE_DIR = join(import.meta.dir, "../../core/test/fixtures")

test("resolveContentImages turns unresizable images into omission notes", async () => {
	const raw = await notebookReadCellAttachmentTool.run({
		path: join(FIXTURE_DIR, "subtly-corrupt-images.ipynb"),
		cellId: "corrupt-attachment",
		key: "corrupt.png"
	})
	expect(raw[0]?.type).toBe("image")
	const resolved = await resolveContentImages(raw)
	expect(resolved).toEqual([{ type: "text", text: "[Image omitted: could not be resized below the inline image size limit.]" }])
})

test("resolveContentImages passes text through unchanged", async () => {
	const content = [{ type: "text" as const, text: "hello" }]
	expect(await resolveContentImages(content)).toEqual(content)
})
