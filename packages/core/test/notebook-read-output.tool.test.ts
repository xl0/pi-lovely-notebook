import { expect, test } from "bun:test"
import { join } from "node:path"
import { notebookReadOutputTool } from "../src/tools"
import { createTempNotebook, FIXTURE_DIR, firstText } from "./helpers"

test("runNotebookReadOutput labels each mime variant and wraps repr-like text", async () => {
	const fixture = await createTempNotebook(
		"multi.ipynb",
		JSON.stringify({
			nbformat: 4,
			nbformat_minor: 5,
			cells: [
				{
					cell_type: "code",
					id: "c",
					source: "obj\n",
					outputs: [{ output_type: "execute_result", data: { "image/png": "AAAA", "text/plain": ["<module.Proxy>"] } }]
				}
			]
		})
	)

	try {
		// Image variants carry no text, so they self-close; the repr stays inside its element.
		const result = await notebookReadOutputTool.run({ path: fixture.path, cellId: "c", outputIndex: 0, includeImages: false })
		expect(firstText(result)).toBe('<output mime="image/png" />\n<output mime="text/plain">\n<module.Proxy>\n</output>')
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookReadOutput uses 0-based output indices", async () => {
	const path = join(FIXTURE_DIR, "lovely-history.ipynb")
	const result = await notebookReadOutputTool.run({ path, index: 4, outputIndex: 0, mime: "text/plain" })

	expect(firstText(result)).toBe("tensor(10, device='cuda:0')")
	await expect(notebookReadOutputTool.run({ path, index: 4, outputIndex: -1 })).rejects.toThrow("Output index out of range: -1")
})

test("runNotebookReadOutput defaults to the only output, and refuses to guess when there are several", async () => {
	const path = join(FIXTURE_DIR, "lovely-history.ipynb")
	expect(firstText(await notebookReadOutputTool.run({ path, index: 4 }))).toBe("tensor(10, device='cuda:0')")

	const fixture = await createTempNotebook(
		"two-outputs.ipynb",
		JSON.stringify({
			nbformat: 4,
			nbformat_minor: 5,
			cells: [
				{
					cell_type: "code",
					id: "c",
					source: "run()\n",
					outputs: [
						{ output_type: "stream", name: "stdout", text: ["log\n"] },
						{ output_type: "execute_result", data: { "text/plain": ["42"] } }
					]
				}
			]
		})
	)

	try {
		await expect(notebookReadOutputTool.run({ path: fixture.path, cellId: "c" })).rejects.toThrow(
			"Cell index 0 has 2 outputs; pass outputIndex (0-1)"
		)
		expect(firstText(await notebookReadOutputTool.run({ path: fixture.path, cellId: "c", outputIndex: 1 }))).toBe("42")
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookReadOutput returns raw image outputs", async () => {
	const result = await notebookReadOutputTool.run({
		path: join(FIXTURE_DIR, "subtly-corrupt-images.ipynb"),
		cellId: "corrupt-output",
		outputIndex: 0,
		mime: "image/png"
	})
	expect(result).toHaveLength(1)
	expect(result[0]?.type).toBe("image")
	expect(result[0]?.type === "image" && result[0].mimeType).toBe("image/png")
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
