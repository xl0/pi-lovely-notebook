#!/usr/bin/env bun
/**
 * Exercise the notebook core against a corpus of real notebooks.
 *
 *   bun scripts/check-notebooks.ts [root] [--verbose]
 *
 * For every .ipynb found under `root` (default: the parent of this repo) it checks that
 *   - parsing succeeds, or fails with a clear "unsupported" message (nbformat 3 and friends)
 *   - summary, cell reads, output reads and attachment reads never throw
 *   - saving loses nothing (content compares equal ignoring Jupyter's string/string[] freedom)
 *   - saving a canonical notebook is byte-identical, so edits do not churn the file in git
 *
 * Originals are never touched: every save happens on a copy in a temp directory.
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join, relative } from "node:path"
import {
	extractDataUriImages,
	formatNotebookSummary,
	loadNotebook,
	type Notebook,
	parseNotebook,
	readCellAtIndex,
	readCellAttachment,
	readCellOutput,
	saveNotebook,
	sliceCellSource,
	summarizeNotebook
} from "../packages/core/src/index"

const SKIP_DIR = /(^|\/)(\.git|node_modules|\.ipynb_checkpoints|\.venv|venv|site-packages|dist|build|\.next|target)(\/|$)/
const args = process.argv.slice(2)
const verbose = args.includes("--verbose")
const root = args.find(arg => !arg.startsWith("--")) ?? join(import.meta.dir, "../../..")

type Problem = { path: string; kind: string; detail: string }
const problems: Problem[] = []
const counts = { total: 0, ok: 0, unsupported: 0, reformatted: 0 }
const record = (path: string, kind: string, detail: string) => problems.push({ path, kind, detail })
const message = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Jupyter lets multiline text be a string or a list of lines; collapse both so content can be compared. */
function comparable(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.every(item => typeof item === "string") ? value.join("") : value.map(comparable)
	}
	if (value === null || typeof value !== "object") return value
	const source = value as Record<string, unknown>
	return Object.fromEntries(
		Object.keys(source)
			.sort()
			.map(key => [key, comparable(source[key])])
	)
}

const isCanonical = (raw: string) => raw.endsWith("\n") && JSON.stringify(sortedJson(JSON.parse(raw)), null, 1) === raw.slice(0, -1)

function sortedJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortedJson)
	if (value === null || typeof value !== "object") return value
	const source = value as Record<string, unknown>
	return Object.fromEntries(
		Object.keys(source)
			.sort()
			.map(key => [key, sortedJson(source[key])])
	)
}

/** Every read path an agent can reach, so exotic notebooks surface crashes here rather than in a session. */
function exerciseReads(path: string, notebook: Notebook) {
	formatNotebookSummary(summarizeNotebook(notebook))

	notebook.cells.forEach((cell, index) => {
		const read = readCellAtIndex(notebook, index)
		sliceCellSource(read.source, 0, 5)
		if (read.type === "markdown") extractDataUriImages(read.source)

		for (const key of Object.keys(cell.attachments ?? {})) {
			try {
				readCellAttachment(notebook, index, key)
			} catch (error) {
				// Attachments without image data are a legitimate refusal, not a crash.
				if (!message(error).includes("has no image data")) record(path, "attachment read", `cell ${index} ${key}: ${message(error)}`)
			}
		}

		if (cell.cell_type !== "code") return
		;(cell.outputs ?? []).forEach((_output, outputIndex) => {
			try {
				readCellOutput(notebook, index, outputIndex)
			} catch (error) {
				const known = ["has no data", "has no mime types", "has no displayable content"].some(text => message(error).includes(text))
				if (!known) record(path, "output read", `cell ${index} output ${outputIndex}: ${message(error)}`)
			}
		})
	})
}

const scratch = await mkdtemp(join(tmpdir(), "notebook-corpus-"))
const started = Date.now()

for await (const path of new Bun.Glob("**/*.ipynb").scan({ cwd: root, absolute: true, onlyFiles: true })) {
	if (SKIP_DIR.test(path)) continue
	counts.total += 1
	const shown = relative(root, path)

	let raw: string
	let notebook: Notebook
	try {
		raw = await readFile(path, "utf8")
		notebook = parseNotebook(raw)
	} catch (error) {
		const text = message(error)
		// nbformat 3 and unreadable files are refusals by design; anything else is a bug.
		if (/Only nbformat 4|Unsupported cell type|Unsupported output type|JSON Parse error|Unexpected/.test(text)) {
			counts.unsupported += 1
			if (verbose) console.log(`skip  ${shown}: ${text}`)
		} else {
			record(shown, "parse", text)
		}
		continue
	}

	try {
		exerciseReads(shown, notebook)
	} catch (error) {
		record(shown, "read", message(error))
		continue
	}

	const copy = join(scratch, basename(path))
	try {
		await writeFile(copy, raw)
		await saveNotebook(copy, await loadNotebook(copy))
		const written = await readFile(copy, "utf8")

		if (JSON.stringify(comparable(JSON.parse(raw))) !== JSON.stringify(comparable(JSON.parse(written)))) {
			record(shown, "CONTENT LOSS", "saved notebook differs from the original in content, not just formatting")
		} else if (written === raw) {
			counts.ok += 1
		} else if (isCanonical(raw)) {
			record(shown, "CHURN", `canonical input rewritten (${raw.split("\n").length} lines)`)
		} else {
			// Not written by Jupyter/VSCode: one-time convergence, but it must then be stable.
			counts.reformatted += 1
			await saveNotebook(copy, await loadNotebook(copy))
			if ((await readFile(copy, "utf8")) !== written) record(shown, "UNSTABLE", "second save differs from the first")
			if (verbose) console.log(`reformat ${shown}`)
		}
	} catch (error) {
		record(shown, "save", message(error))
	} finally {
		await rm(copy, { force: true })
	}
}

await rm(scratch, { recursive: true, force: true })

const grouped = new Map<string, Problem[]>()
for (const problem of problems) grouped.set(problem.kind, [...(grouped.get(problem.kind) ?? []), problem])

console.log(`\n${counts.total} notebooks under ${root} in ${((Date.now() - started) / 1000).toFixed(1)}s`)
console.log(`  ${counts.ok} byte-identical roundtrip`)
console.log(`  ${counts.reformatted} reformatted once (input was not canonical), stable afterwards`)
console.log(`  ${counts.unsupported} unsupported by design`)
console.log(`  ${problems.length} problems`)

for (const [kind, entries] of grouped) {
	console.log(`\n${kind} (${entries.length}):`)
	for (const entry of entries.slice(0, 10)) console.log(`  ${entry.path}\n    ${entry.detail}`)
	if (entries.length > 10) console.log(`  ... and ${entries.length - 10} more`)
}

process.exit(problems.length === 0 ? 0 : 1)
