import { expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
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

		expect(firstText(result)).toBe(`Created notebook ${path} with language python.`)
		expect(notebook).toEqual({
			cells: [],
			metadata: { language_info: { name: "python" } },
			nbformat: 4,
			nbformat_minor: 5
		})
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})

test("runNotebookCreate accepts a language and refuses to clobber an existing file", async () => {
	const dir = await mkdtemp(join(tmpdir(), "notebook-test-"))
	const customPath = join(dir, "custom.ipynb")
	const fixture = await createTempNotebook("exists.ipynb", "already here")

	try {
		await notebookCreateTool.run({ path: customPath, language: "r" })
		expect((await loadNotebook(customPath)).metadata?.language_info?.name).toBe("r")

		// Exclusive create: the write itself refuses, so there is no check-then-write window.
		await expect(notebookCreateTool.run({ path: fixture.path, language: "r" })).rejects.toThrow(
			`EEXIST: file already exists, open '${fixture.path}'`
		)
		expect(await readFile(fixture.path, "utf8")).toBe("already here")
	} finally {
		await rm(dir, { recursive: true, force: true })
		await fixture.cleanup()
	}
})
