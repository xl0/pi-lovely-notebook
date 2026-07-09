import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type Notebook, type NotebookReadCell, readCellAtIndex, resolveCellIndex } from "../extensions/notebook/notebook"
import type { NotebookToolContent } from "../extensions/notebook/tools"

export const FIXTURE_DIR = join(import.meta.dir, "fixtures")

export function firstText(content: NotebookToolContent): string | undefined {
	const first = content[0]
	return first?.type === "text" ? first.text : undefined
}

export function readAllCells(notebook: Notebook): NotebookReadCell[] {
	return notebook.cells.map((_cell, index) => readCellAtIndex(notebook, index))
}

export function readCellById(notebook: Notebook, cellId: string): NotebookReadCell {
	return readCellAtIndex(notebook, resolveCellIndex(notebook, { cellId }))
}

export async function copyFixture(name: string) {
	const dir = await mkdtemp(join(tmpdir(), "notebook-test-"))
	const path = join(dir, name)
	await Bun.write(path, await readFile(join(FIXTURE_DIR, name)))
	return {
		dir,
		path,
		cleanup: () => rm(dir, { recursive: true, force: true })
	}
}

export async function createTempNotebook(name: string, text: string) {
	const dir = await mkdtemp(join(tmpdir(), "notebook-test-"))
	const path = join(dir, name)
	await Bun.write(path, text)
	return {
		dir,
		path,
		cleanup: () => rm(dir, { recursive: true, force: true })
	}
}

export function createNotebookText() {
	return JSON.stringify({
		nbformat: 4,
		nbformat_minor: 5,
		metadata: {
			kernelspec: { name: "python3" },
			language_info: { name: "python" },
			custom: { keep: true }
		},
		cells: [
			{
				cell_type: "markdown",
				id: "intro",
				source: ["# Title\n", "More text\n"],
				metadata: { tags: ["lead"] }
			},
			{
				cell_type: "code",
				id: "code-1",
				source: "print(1)\nprint(2)\n",
				execution_count: 7,
				outputs: [{ output_type: "stream" }],
				metadata: { trusted: true }
			}
		]
	})
}
