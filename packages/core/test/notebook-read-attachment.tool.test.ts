import { expect, test } from "bun:test"
import { join } from "node:path"
import { notebookReadCellAttachmentTool } from "../src/tools"
import { createTempNotebook, FIXTURE_DIR } from "./helpers"

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

test("runNotebookReadCellAttachment returns svg attachments as text, not as image content", async () => {
	const fixture = await createTempNotebook(
		"svg-attachment.ipynb",
		JSON.stringify({
			nbformat: 4,
			nbformat_minor: 5,
			cells: [
				{
					cell_type: "markdown",
					id: "text-svg",
					source: ["![d](attachment:d.svg)\n"],
					attachments: { "d.svg": { "image/svg+xml": ["<svg />"] } }
				},
				{
					cell_type: "markdown",
					id: "base64-svg",
					source: ["![p](attachment:p.svg)\n"],
					attachments: { "p.svg": { "image/svg+xml": Buffer.from("<svg />").toString("base64") } }
				}
			]
		})
	)

	try {
		// Sent as image content either form would reach the host's resizer and come back as "too large".
		const stored = await notebookReadCellAttachmentTool.run({ path: fixture.path, cellId: "text-svg", key: "d.svg" })
		expect(stored).toEqual([{ type: "text", text: "<svg />" }])
		// JupyterLab base64s pasted images, svg included.
		const pasted = await notebookReadCellAttachmentTool.run({ path: fixture.path, cellId: "base64-svg", key: "p.svg" })
		expect(pasted).toEqual([{ type: "text", text: "<svg />" }])
		// Markup is paginated like any other text, so a truncated read can be continued.
		const paged = await notebookReadCellAttachmentTool.run({ path: fixture.path, cellId: "text-svg", key: "d.svg", lineOffset: 2 })
		expect(paged).toEqual([{ type: "text", text: "[No lines at offset 2: 1 lines total]" }])
	} finally {
		await fixture.cleanup()
	}
})
