import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
	applyExactSourceEdits,
	clearCellOutputs,
	deleteCell,
	editCellSource,
	ensureCellIds,
	formatNotebookSummary,
	insertCell,
	loadNotebook,
	mergeCell,
	moveCell,
	normalizeSource,
	parseNotebook,
	readAllCells,
	readCellById,
	saveNotebook,
	sliceCellSource,
	summarizeNotebook,
	writeCellSource
} from "../extensions/notebook/notebook"
import { createNotebookText, FIXTURE_DIR } from "./helpers"

describe("notebook core", () => {
	test("parse + summary", () => {
		const notebook = parseNotebook(createNotebookText())
		const summary = summarizeNotebook("demo.ipynb", notebook)

		expect(summary.cellCount).toBe(2)
		expect(summary.kernelName).toBe("python3")
		expect(summary.language).toBe("python")
		expect(summary.cells[0]).toEqual({
			index: 1,
			id: "intro",
			type: "markdown",
			sourceLines: 3,
			preview: "# Title\nMore text\n",
			previewLines: 2,
			previewTruncated: false,
			previewRemainingLines: 0
		})
		expect(summary.cells[1]?.outputCount).toBe(1)
		expect(summary.cells[1]?.outputs).toEqual([
			{
				index: 1,
				type: "stream",
				preview: "",
				previewLines: 0,
				previewTruncated: false,
				previewRemainingLines: 0
			}
		])
	})

	test("read cells", () => {
		const notebook = parseNotebook(createNotebookText())
		expect(readAllCells(notebook)).toHaveLength(2)
		expect(readCellById(notebook, "code-1").source).toBe("print(1)\nprint(2)\n")
		expect(["code-1", "intro"].map(id => readCellById(notebook, id).id)).toEqual(["code-1", "intro"])
		expect(
			readAllCells(notebook)
				.slice(0, 2)
				.map(cell => cell.id)
		).toEqual(["intro", "code-1"])
	})

	test("normalizes string array source", () => {
		expect(normalizeSource(["a", "b"])).toBe("ab")
	})

	test("rejects non-v4 notebooks", () => {
		expect(() => parseNotebook(JSON.stringify({ nbformat: 3, cells: [] }))).toThrow("Only nbformat 4 notebooks are supported")
	})

	test("parseNotebook validates root and cells", () => {
		expect(() => parseNotebook("[]")).toThrow("Notebook root must be an object")
		expect(() => parseNotebook(JSON.stringify({ nbformat: 4, nbformat_minor: 5, cells: {} }))).toThrow("Notebook cells must be an array")
		expect(() => parseNotebook(JSON.stringify({ nbformat: 4, nbformat_minor: 5, cells: [null] }))).toThrow("Cell 0 must be an object")
		expect(() => parseNotebook(JSON.stringify({ nbformat: 4, nbformat_minor: 5, cells: [{}] }))).toThrow("Cell 0 is missing cell_type")
	})

	test("writeCellSource replaces full source", () => {
		const notebook = parseNotebook(createNotebookText())
		writeCellSource(notebook, "code-1", "print(42)\n")
		expect(readCellById(notebook, "code-1").source).toBe("print(42)\n")
		expect(notebook.cells[1]?.outputs).toEqual([{ output_type: "stream" }])
	})

	test("applyExactSourceEdits applies non-overlapping exact edits", () => {
		expect(
			applyExactSourceEdits("alpha beta gamma", [
				{ oldText: "alpha", newText: "one" },
				{ oldText: "gamma", newText: "three" }
			])
		).toBe("one beta three")
	})

	test("applyExactSourceEdits rejects ambiguous matches", () => {
		expect(() => applyExactSourceEdits("x x", [{ oldText: "x", newText: "y" }])).toThrow('Edit text is ambiguous: "x"')
	})

	test("applyExactSourceEdits rejects missing matches", () => {
		expect(() => applyExactSourceEdits("abc", [{ oldText: "z", newText: "y" }])).toThrow('Edit text not found: "z"')
	})

	test("applyExactSourceEdits rejects overlapping ranges", () => {
		expect(() =>
			applyExactSourceEdits("abcdef", [
				{ oldText: "abc", newText: "x" },
				{ oldText: "bcd", newText: "y" }
			])
		).toThrow("Edit ranges overlap")
	})

	test("readCellById fails on missing id", () => {
		const notebook = parseNotebook(createNotebookText())
		expect(() => readCellById(notebook, "missing")).toThrow("Cell not found: missing")
	})

	test("writeCellSource preserves metadata and fails on missing id", () => {
		const notebook = parseNotebook(createNotebookText())
		writeCellSource(notebook, "code-1", "print(42)\n")
		expect(notebook.cells[1]?.metadata).toEqual({ trusted: true })
		expect(() => writeCellSource(notebook, "missing", "x")).toThrow("Cell not found: missing")
	})

	test("editCellSource updates one cell in place and preserves outputs", () => {
		const notebook = parseNotebook(createNotebookText())
		editCellSource(notebook, "code-1", [{ oldText: "print(1)", newText: "print(10)" }])
		expect(readCellById(notebook, "code-1").source).toBe("print(10)\nprint(2)\n")
		expect(notebook.cells[1]?.outputs).toEqual([{ output_type: "stream" }])
	})

	test("insertCell inserts a code cell after an anchor and initializes code fields", () => {
		const notebook = parseNotebook(createNotebookText())
		const inserted = insertCell(notebook, { cellId: "intro", direction: "after" }, { type: "code", source: "print(3)\n" })
		expect(inserted.index).toBe(2)
		expect(inserted.type).toBe("code")
		expect(inserted.source).toBe("print(3)\n")
		expect(inserted.id).toBeTruthy()
		expect(notebook.cells[1]?.execution_count).toBeNull()
		expect(notebook.cells[1]?.outputs).toEqual([])
	})

	test("insertCell inserts by index and rejects invalid selectors", () => {
		const notebook = parseNotebook(createNotebookText())
		const inserted = insertCell(notebook, { index: 1, direction: "before" }, { type: "markdown", source: "note\n" })
		expect(inserted.index).toBe(1)
		expect(readAllCells(notebook)[0]?.source).toBe("note\n")
		expect(() => insertCell(notebook, { cellId: "intro", index: 1, direction: "after" }, { type: "raw", source: "x" })).toThrow(
			"Provide exactly one of cellId or index"
		)
		expect(() => insertCell(notebook, { index: 99, direction: "after" }, { type: "raw", source: "x" })).toThrow(
			"Cell index out of range: 99"
		)
	})

	test("deleteCell removes one cell and returns its prior read view", () => {
		const notebook = parseNotebook(createNotebookText())
		const deleted = deleteCell(notebook, "code-1")
		expect(deleted.id).toBe("code-1")
		expect(deleted.source).toBe("print(1)\nprint(2)\n")
		expect(notebook.cells).toHaveLength(1)
		expect(() => readCellById(notebook, "code-1")).toThrow("Cell not found: code-1")
	})

	test("moveCell reorders one cell relative to another cell", () => {
		const notebook = parseNotebook(createNotebookText())
		const moved = moveCell(notebook, "code-1", "intro", "before")
		expect(moved.index).toBe(1)
		expect(moved.id).toBe("code-1")
		expect(readAllCells(notebook).map(cell => cell.id)).toEqual(["code-1", "intro"])
		expect(() => moveCell(notebook, "code-1", "code-1", "before")).toThrow("Cannot move a cell relative to itself")
		expect(() => moveCell(notebook, "code-1", 99, "before")).toThrow("Cell index out of range: 99")
	})

	test("mergeCell merges adjacent same-type cells and preserves the anchor id", () => {
		const notebook = parseNotebook(
			JSON.stringify({
				nbformat: 4,
				nbformat_minor: 5,
				cells: [
					{ cell_type: "markdown", id: "a", source: "one" },
					{ cell_type: "markdown", id: "b", source: "two\n" }
				]
			})
		)
		const result = mergeCell(notebook, "a", "below")
		expect(result.merged.id).toBe("a")
		expect(result.removed.id).toBe("b")
		expect(result.merged.source).toBe("one\ntwo\n")
		expect(notebook.cells).toHaveLength(1)
	})

	test("mergeCell rejects missing neighbors and mixed cell types", () => {
		const notebook = parseNotebook(createNotebookText())
		expect(() => mergeCell(notebook, "intro", "above")).toThrow("No cell to merge above from intro")
		expect(() => mergeCell(notebook, "intro", "below")).toThrow("Cannot merge markdown cell with code cell")
	})

	test("clearCellOutputs clears code outputs and rejects non-code cells", () => {
		const notebook = parseNotebook(createNotebookText())
		const cleared = clearCellOutputs(notebook, "code-1")
		expect(cleared.id).toBe("code-1")
		expect(notebook.cells[1]?.outputs).toEqual([])
		expect(notebook.cells[1]?.execution_count).toBe(7)
		expect(() => clearCellOutputs(notebook, "intro")).toThrow("Cell is not code: intro")
	})

	test("formatNotebookSummary uses xml-ish cell headers plus raw previews", () => {
		const summary = summarizeNotebook("demo.ipynb", parseNotebook(createNotebookText()))
		const formatted = formatNotebookSummary(summary)
		expect(formatted).toContain("meta nbformat=4.5 kernel=python3 cells=2 language=python")
		expect(formatted).toContain('<cell index="1" id="intro" type="md" lines="3" />\n# Title\nMore text\n')
		expect(formatted).toContain('<cell index="2" id="code-1" type="code" lines="3" n_exec="7" outputs="1" />')
		expect(formatted).toContain('<output cell_id="code-1" index="1" type="stream" />')
	})

	test("summary handles missing metadata and missing source", () => {
		const notebook = parseNotebook(
			JSON.stringify({
				nbformat: 4,
				nbformat_minor: 2,
				cells: [{ cell_type: "markdown", id: "a" }]
			})
		)
		expect(summarizeNotebook("empty.ipynb", notebook)).toEqual({
			path: "empty.ipynb",
			nbformat: 4,
			nbformatMinor: 2,
			kernelName: null,
			language: null,
			cellCount: 1,
			cells: [
				{
					index: 1,
					id: "a",
					type: "markdown",
					sourceLines: 0,
					preview: "",
					previewLines: 0,
					previewTruncated: false,
					previewRemainingLines: 0
				}
			]
		})
	})

	test("summary preview truncates after 5 lines and adds remaining-lines marker", () => {
		const notebook = parseNotebook(
			JSON.stringify({
				nbformat: 4,
				nbformat_minor: 5,
				cells: [{ cell_type: "markdown", id: "a", source: ["one\n", "two\n", "three\n", "four\n", "five\n", "six\n"] }]
			})
		)
		const summary = summarizeNotebook("long.ipynb", notebook)
		expect(summary.cells[0]?.preview).toBe("one\ntwo\nthree\nfour\nfive\n[1 more lines]")
		expect(summary.cells[0]?.previewLines).toBe(5)
		expect(summary.cells[0]?.previewTruncated).toBe(true)
		expect(summary.cells[0]?.previewRemainingLines).toBe(1)
		expect(formatNotebookSummary(summary)).toContain("five\n[1 more lines]")
	})

	test("summary formats output inventories and output previews", () => {
		const notebook = parseNotebook(
			JSON.stringify({
				nbformat: 4,
				nbformat_minor: 5,
				cells: [
					{
						cell_type: "code",
						id: "c",
						source: "pass\n",
						outputs: [
							{ output_type: "stream", name: "stdout", text: ["a\n", "b\n", "c\n", "d\n", "e\n", "f\n"] },
							{
								output_type: "execute_result",
								execution_count: 3,
								data: { "text/plain": ["42\n"], "text/html": ["<b>42</b>"], "image/png": "AAAA" }
							},
							{ output_type: "error", ename: "ValueError", traceback: ["tb1", "tb2"] }
						]
					}
				]
			})
		)
		const formatted = formatNotebookSummary(summarizeNotebook("demo.ipynb", notebook))
		expect(formatted).toContain('<output cell_id="c" index="1" type="stream" name="stdout" />\na\nb\nc\nd\ne\n[1 more lines]')
		expect(formatted).toContain('<output cell_id="c" index="2" type="execute_result" mime="text/plain" n_exec="3" />\n42\n')
		expect(formatted).toContain('<output cell_id="c" index="2" type="execute_result" mime="text/html" n_exec="3" />\n<b>42</b>')
		expect(formatted).toContain('<output cell_id="c" index="2" type="execute_result" mime="image/png" n_exec="3" />')
		expect(formatted).not.toContain('mime="image/png" n_exec="3" />\nAAAA')
		expect(formatted).toContain('<output cell_id="c" index="3" type="error" ename="ValueError" />\ntb1\ntb2\n')
	})

	test("saveNotebook writes deterministic json with trailing newline", async () => {
		const dir = await mkdtemp(join(tmpdir(), "notebook-test-"))
		const path = join(dir, "demo.ipynb")

		try {
			const notebook = parseNotebook(createNotebookText())
			await saveNotebook(path, notebook)
			const written = await readFile(path, "utf8")
			expect(written.endsWith("\n")).toBe(true)
			expect(JSON.parse(written)).toEqual(notebook)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	test("loadNotebook roundtrips saved notebook", async () => {
		const dir = await mkdtemp(join(tmpdir(), "notebook-test-"))
		const path = join(dir, "demo.ipynb")

		try {
			const notebook = parseNotebook(createNotebookText())
			await saveNotebook(path, notebook)
			expect(await loadNotebook(path)).toEqual(notebook)
		} finally {
			await rm(dir, { recursive: true, force: true })
		}
	})

	test("loads real fixture with cell ids and mixed cell types", async () => {
		const notebook = await loadNotebook(join(FIXTURE_DIR, "lovely-history.ipynb"))
		const summary = summarizeNotebook("lovely-history.ipynb", notebook)

		expect(summary.nbformatMinor).toBe(5)
		expect(summary.cellCount).toBe(12)
		expect(summary.kernelName).toBe("python3")
		expect(summary.language).toBe(null)
		expect(summary.cells[0]?.type).toBe("markdown")
		expect(summary.cells[1]?.type).toBe("code")
		expect(summary.cells[1]?.id).toBeTruthy()
		expect(summary.cells.some(cell => cell.outputCount === 1)).toBe(true)
	})

	test("sliceCellSource slices raw source by line", () => {
		const source = "a\nb\nc\n"
		expect(sliceCellSource(source)).toBe(source)
		expect(sliceCellSource(source, 1, 1)).toBe("b\n[1 more lines. Use offset=2 to continue.]")
		expect(() => sliceCellSource(source, -1)).toThrow("Invalid lineOffset: -1")
		expect(() => sliceCellSource(source, 0, -1)).toThrow("Invalid lineLimit: -1")
	})

	test("summary omits null execution counts from formatted rows", async () => {
		const notebook = await loadNotebook(join(FIXTURE_DIR, "lovely-history.ipynb"))
		const formatted = formatNotebookSummary(summarizeNotebook("lovely-history.ipynb", notebook))
		expect(formatted).toContain('<cell index="2" id="57d6942b" type="code" lines="3" outputs="0" />')
		expect(formatted).not.toContain("n_exec=null")
	})

	test("markdown preview escapes literal trailing backslashes and newlines", async () => {
		const notebook = await loadNotebook(join(FIXTURE_DIR, "lovely-history.ipynb"))
		const summary = summarizeNotebook("lovely-history.ipynb", notebook)
		const preview = summary.cells[7]?.preview ?? ""
		const start = preview.indexOf("deleted it.")
		expect(preview.slice(start, start + 11)).toBe("deleted it.")
	})

	test("ensureCellIds assigns short random ids and bumps minor version", async () => {
		const notebook = await loadNotebook(join(FIXTURE_DIR, "lovely-test-no-ids.ipynb"))
		const assigned = ensureCellIds(notebook)

		expect(notebook.nbformat_minor).toBe(5)
		expect(assigned).toHaveLength(2)
		expect(notebook.cells[0]?.id).toMatch(/^[0-9a-f]{8}$/)
		expect(notebook.cells[1]?.id).toMatch(/^[0-9a-f]{8}$/)
	})

	test("real fixture without ids omits ids from summary and read", async () => {
		const notebook = await loadNotebook(join(FIXTURE_DIR, "lovely-test-no-ids.ipynb"))
		const summary = summarizeNotebook("lovely-test-no-ids.ipynb", notebook)

		expect(summary.nbformatMinor).toBe(2)
		expect(summary.cellCount).toBe(2)
		expect(summary.cells.map(cell => cell.id)).toEqual([undefined, undefined])
		expect(readAllCells(notebook).map(cell => cell.id)).toEqual([undefined, undefined])
		expect(() => readCellById(notebook, "missing")).toThrow("Cell not found: missing")
	})
})
