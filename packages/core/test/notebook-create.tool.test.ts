import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { loadNotebook } from "../src/notebook"
import { notebookCreateTool } from "../src/tools"
import { createTempNotebook, firstText } from "./helpers"

test("runNotebookCreate creates empty notebook with default language", async () => {
	const dir = await mkdtemp(join(tmpdir(), "notebook-test-"))
	const path = join(dir, "new.ipynb")

	try {
		const result = await notebookCreateTool.run({ path })
		const notebook = await loadNotebook(path)

		expect(firstText(result)).toBe(`Created notebook ${path} with language python3.`)
		expect(notebook).toEqual({
			cells: [],
			metadata: { language_info: { name: "python3" } },
			nbformat: 4,
			nbformat_minor: 5
		})
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test("runNotebookCreate accepts language and overwrites existing file", async () => {
	const dir = await mkdtemp(join(tmpdir(), "notebook-test-"))
	const customPath = join(dir, "custom.ipynb")
	const fixture = await createTempNotebook("exists.ipynb", "already here")

	try {
		await notebookCreateTool.run({ path: customPath, language: "r" })
		expect((await loadNotebook(customPath)).metadata?.language_info?.name).toBe("r")

		await notebookCreateTool.run({ path: fixture.path, language: "r" })
		expect((await loadNotebook(fixture.path)).metadata?.language_info?.name).toBe("r")
	} finally {
		await rm(dir, { recursive: true, force: true })
		await fixture.cleanup()
	}
})
