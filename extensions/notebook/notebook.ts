import { randomBytes } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"

export interface NotebookCell {
	cell_type: string
	id?: string
	source?: string | string[]
	metadata?: Record<string, unknown>
	attachments?: unknown
	execution_count?: number | null
	outputs?: unknown[]
	[key: string]: unknown
}

export interface NotebookMetadata {
	kernelspec?: {
		name?: string
		[key: string]: unknown
	}
	language_info?: {
		name?: string
		[key: string]: unknown
	}
	[key: string]: unknown
}

export interface Notebook {
	nbformat: number
	nbformat_minor: number
	metadata?: NotebookMetadata
	cells: NotebookCell[]
	[key: string]: unknown
}

export interface NotebookOutputSummary {
	index: number
	type: string
	name?: string
	mime?: string
	ename?: string
	executionCount?: number | null
	preview: string
	previewLines: number
	previewTruncated: boolean
	previewRemainingLines: number
}

export interface NotebookCellSummary {
	index: number
	id?: string
	type: string
	sourceLines: number
	preview: string
	previewLines: number
	previewTruncated: boolean
	previewRemainingLines: number
	executionCount?: number | null
	outputCount?: number
	outputs?: NotebookOutputSummary[]
	attachmentKeys?: string[]
}

export interface NotebookSummary {
	path: string
	nbformat: number
	nbformatMinor: number
	kernelName: string | null
	language: string | null
	cellCount: number
	cells: NotebookCellSummary[]
}

export interface NotebookReadCell {
	index: number
	id?: string
	type: string
	source: string
	executionCount?: number | null
}

function quoteAttribute(text: string): string {
	return `"${text.replaceAll("&", "&amp;").replaceAll('"', "&quot;")}"`
}

export interface NotebookSourceEdit {
	oldText: string
	newText: string
}

export interface NotebookInsertCell {
	type: "code" | "markdown" | "raw"
	source: string
}

export interface NotebookInsertTarget {
	cellId?: string
	index?: number
	direction: "before" | "after"
}

export interface NotebookMergeResult {
	merged: NotebookReadCell
	removed: NotebookReadCell
}

type RawObject = Record<string, unknown>

type RawNotebook = RawObject & {
	nbformat?: unknown
	cells?: unknown
}

type RawCell = RawObject & {
	cell_type?: unknown
}

type RawOutput = RawObject & {
	output_type?: unknown
	name?: unknown
	text?: unknown
	data?: unknown
	ename?: unknown
	execution_count?: unknown
	traceback?: unknown
}

function isObject(value: unknown): value is RawObject {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function storedCellId(cell: NotebookCell): string | undefined {
	return typeof cell.id === "string" && cell.id.length > 0 ? cell.id : undefined
}

function cellAt(notebook: Notebook, index: number): NotebookCell {
	const cell = notebook.cells[index]
	if (cell === undefined) throw new Error(`Cell index out of range: ${index + 1}`)
	return cell
}

function cellIndexFromUserIndex(notebook: Notebook, index: number): number {
	if (!Number.isInteger(index) || index < 1 || index > notebook.cells.length) {
		throw new Error(`Cell index out of range: ${index}`)
	}
	return index - 1
}

export function normalizeSource(source: NotebookCell["source"]): string {
	if (typeof source === "string") return source
	if (Array.isArray(source)) return source.join("")
	return ""
}

function sourceToLines(source: string): string[] {
	if (source.length === 0) return []
	return source.match(/[^\n]*\n|[^\n]+/g) ?? []
}

function previewSource(source: string): { text: string; lines: number; truncated: boolean; remainingLines: number } {
	const maxLines = 5
	const lines = sourceToLines(source)
	const shownLines = lines.slice(0, maxLines)
	const truncated = lines.length > maxLines
	const remainingLines = Math.max(0, lines.length - shownLines.length)
	const text = truncated ? `${shownLines.join("").replace(/\n?$/, "")}\n[${remainingLines} more lines]` : shownLines.join("")
	return { text, lines: shownLines.length, truncated, remainingLines }
}

function normalizeOutputText(value: unknown): string {
	if (typeof value === "string") return value
	if (Array.isArray(value) && value.every(part => typeof part === "string")) return value.join("")
	return ""
}

function isTextLikeMime(mime: string): boolean {
	return mime.startsWith("text/") || mime === "application/json"
}

function summarizeOutput(output: unknown, index: number): NotebookOutputSummary[] {
	const raw = isObject(output) ? (output as RawOutput) : {}
	const type = typeof raw.output_type === "string" ? raw.output_type : "unknown"
	const base = {
		index: index + 1,
		type,
		...(typeof raw.name === "string" ? { name: raw.name } : {}),
		...(typeof raw.ename === "string" ? { ename: raw.ename } : {}),
		...(typeof raw.execution_count === "number" || raw.execution_count === null ? { executionCount: raw.execution_count } : {})
	}

	if (type === "stream") {
		const preview = previewSource(normalizeOutputText(raw.text))
		return [
			{
				...base,
				preview: preview.text,
				previewLines: preview.lines,
				previewTruncated: preview.truncated,
				previewRemainingLines: preview.remainingLines
			}
		]
	}

	if ((type === "display_data" || type === "execute_result") && isObject(raw.data)) {
		return Object.entries(raw.data).map(([mime, value]) => {
			const text = isTextLikeMime(mime) ? normalizeOutputText(value) : ""
			const preview = previewSource(text)
			return {
				...base,
				mime,
				preview: preview.text,
				previewLines: preview.lines,
				previewTruncated: preview.truncated,
				previewRemainingLines: preview.remainingLines
			}
		})
	}

	if (type === "error") {
		const traceback = Array.isArray(raw.traceback) ? raw.traceback.filter((line): line is string => typeof line === "string") : []
		let text = traceback.join("\n")
		if (text.length > 0 && !text.endsWith("\n")) text += "\n"
		const preview = previewSource(text)
		return [
			{
				...base,
				preview: preview.text,
				previewLines: preview.lines,
				previewTruncated: preview.truncated,
				previewRemainingLines: preview.remainingLines
			}
		]
	}

	return [{ ...base, preview: "", previewLines: 0, previewTruncated: false, previewRemainingLines: 0 }]
}

function joinCellSources(a: string, b: string): string {
	if (a.length === 0 || b.length === 0) return `${a}${b}`
	if (a.endsWith("\n") || b.startsWith("\n")) return `${a}${b}`
	return `${a}\n${b}`
}

function sourceLineCount(source: string): number {
	if (source.length === 0) return 0
	return source.split("\n").length
}

function createCellId(notebook: Notebook): string {
	const ids = new Set(notebook.cells.map(cell => storedCellId(cell)).filter((id): id is string => id !== undefined))
	let id = randomBytes(4).toString("hex")
	while (ids.has(id)) id = randomBytes(4).toString("hex")
	return id
}

function readCell(cell: NotebookCell, index: number): NotebookReadCell {
	const id = storedCellId(cell)
	const executionCount = cell.cell_type === "code" ? ((cell.execution_count as number | null | undefined) ?? null) : undefined
	return {
		index: index + 1,
		...(id === undefined ? {} : { id }),
		type: cell.cell_type,
		source: normalizeSource(cell.source),
		...(executionCount === undefined ? {} : { executionCount })
	}
}

function findCellIndexBySelector(notebook: Notebook, selector: string | number): number {
	if (typeof selector === "number") {
		return cellIndexFromUserIndex(notebook, selector)
	}

	const index = notebook.cells.findIndex(cell => storedCellId(cell) === selector)
	if (index === -1) throw new Error(`Cell not found: ${selector}`)
	return index
}

export function parseNotebook(text: string): Notebook {
	const data: unknown = JSON.parse(text)
	if (!isObject(data)) throw new Error("Notebook root must be an object")
	const notebook = data as RawNotebook
	if (notebook.nbformat !== 4) throw new Error("Only nbformat 4 notebooks are supported")
	if (!Array.isArray(notebook.cells)) throw new Error("Notebook cells must be an array")

	for (const [index, cell] of notebook.cells.entries()) {
		if (!isObject(cell)) throw new Error(`Cell ${index} must be an object`)
		if (typeof (cell as RawCell).cell_type !== "string") throw new Error(`Cell ${index} is missing cell_type`)
	}

	return notebook as Notebook
}

export async function loadNotebook(path: string): Promise<Notebook> {
	return parseNotebook(await readFile(path, "utf8"))
}

export async function saveNotebook(path: string, notebook: Notebook): Promise<void> {
	for (const [index, cell] of notebook.cells.entries()) {
		notebook.cells[index] = { ...cell, source: sourceToLines(normalizeSource(cell.source)) }
	}
	await writeFile(path, `${JSON.stringify(notebook, null, 1)}\n`, "utf8")
}

export function summarizeNotebook(path: string, notebook: Notebook): NotebookSummary {
	const metadata = notebook.metadata ?? {}
	const kernelspec = metadata.kernelspec ?? {}
	const languageInfo = metadata.language_info ?? {}

	return {
		path,
		nbformat: notebook.nbformat,
		nbformatMinor: notebook.nbformat_minor,
		kernelName: typeof kernelspec.name === "string" ? kernelspec.name : null,
		language: typeof languageInfo.name === "string" ? languageInfo.name : null,
		cellCount: notebook.cells.length,
		cells: notebook.cells.map((cell, index) => {
			const source = normalizeSource(cell.source)
			const id = storedCellId(cell)
			const executionCount = cell.cell_type === "code" ? ((cell.execution_count as number | null | undefined) ?? null) : undefined
			const outputs = cell.cell_type === "code" && Array.isArray(cell.outputs) ? cell.outputs.flatMap(summarizeOutput) : undefined
			const outputCount = cell.cell_type === "code" ? (Array.isArray(cell.outputs) ? cell.outputs.length : 0) : undefined
			const attachmentKeys = isObject(cell.attachments) ? Object.keys(cell.attachments) : undefined
			const preview = previewSource(source)
			return {
				index: index + 1,
				...(id === undefined ? {} : { id }),
				type: cell.cell_type,
				sourceLines: sourceLineCount(source),
				preview: preview.text,
				previewLines: preview.lines,
				previewTruncated: preview.truncated,
				previewRemainingLines: preview.remainingLines,
				...(executionCount === undefined ? {} : { executionCount }),
				...(outputCount === undefined ? {} : { outputCount }),
				...(outputs === undefined ? {} : { outputs }),
				...(attachmentKeys === undefined || attachmentKeys.length === 0 ? {} : { attachmentKeys })
			}
		})
	}
}

export function formatNotebookSummary(summary: NotebookSummary): string {
	const metadata = [
		`nbformat=${summary.nbformat}.${summary.nbformatMinor}`,
		`kernel=${summary.kernelName ?? "-"}`,
		`cells=${summary.cellCount}`
	]
	if (summary.language) metadata.push(`language=${summary.language}`)

	const lines = [`<meta ${metadata.join(" ")} />`]

	for (const cell of summary.cells) {
		const attrs = [
			`index=${quoteAttribute(String(cell.index))}`,
			`type=${quoteAttribute(cell.type === "markdown" ? "md" : cell.type)}`,
			`lines=${quoteAttribute(String(cell.sourceLines))}`
		]
		if (cell.id) attrs.splice(1, 0, `id=${quoteAttribute(cell.id)}`)
		if (cell.executionCount !== undefined && cell.executionCount !== null)
			attrs.push(`n_exec=${quoteAttribute(String(cell.executionCount))}`)
		if (cell.outputCount !== undefined) attrs.push(`outputs=${quoteAttribute(String(cell.outputCount))}`)
		if (cell.attachmentKeys !== undefined && cell.attachmentKeys.length > 0)
			attrs.push(`atts=${quoteAttribute(cell.attachmentKeys.join(" "))}`)
		lines.push(`<cell ${attrs.join(" ")} />`)
		if (cell.preview.length > 0) lines.push(cell.preview)
		for (const output of cell.outputs ?? []) {
			const outputAttrs = [
				cell.id ? `cell_id=${quoteAttribute(cell.id)}` : `cell_index=${quoteAttribute(String(cell.index))}`,
				`index=${quoteAttribute(String(output.index))}`,
				`type=${quoteAttribute(output.type)}`
			]
			if (output.name) outputAttrs.push(`name=${quoteAttribute(output.name)}`)
			if (output.mime) outputAttrs.push(`mime=${quoteAttribute(output.mime)}`)
			if (output.ename) outputAttrs.push(`ename=${quoteAttribute(output.ename)}`)
			if (output.executionCount !== undefined && output.executionCount !== null) {
				outputAttrs.push(`n_exec=${quoteAttribute(String(output.executionCount))}`)
			}
			lines.push(`<output ${outputAttrs.join(" ")} />`)
			if (output.preview.length > 0) lines.push(output.preview)
		}
	}

	return lines.join("\n")
}

export function sliceCellSource(source: string, lineOffset = 0, lineLimit?: number): string {
	if (!Number.isInteger(lineOffset) || lineOffset < 0) throw new Error(`Invalid lineOffset: ${lineOffset}`)
	if (lineLimit !== undefined && (!Number.isInteger(lineLimit) || lineLimit < 0)) {
		throw new Error(`Invalid lineLimit: ${lineLimit}`)
	}
	const lines = sourceToLines(source)
	if (lineOffset > lines.length) throw new Error(`lineOffset out of range: ${lineOffset}`)
	const sliced = lines.slice(lineOffset, lineLimit === undefined ? undefined : lineOffset + lineLimit)
	const text = sliced.join("")
	const remainingLines = Math.max(0, lines.length - (lineOffset + sliced.length))
	if (lineLimit === undefined || remainingLines === 0) return text
	const continuation = `[${remainingLines} more lines. Use offset=${lineOffset + sliced.length} to continue.]`
	return text.length === 0 ? continuation : `${text}${text.endsWith("\n") ? "" : "\n"}${continuation}`
}

export function readAllCells(notebook: Notebook): NotebookReadCell[] {
	return notebook.cells.map((cell, index) => readCell(cell, index))
}

function findCellIndexById(notebook: Notebook, cellId: string): number {
	return findCellIndexBySelector(notebook, cellId)
}

export function readCellById(notebook: Notebook, cellId: string): NotebookReadCell {
	const index = findCellIndexById(notebook, cellId)
	return readCell(cellAt(notebook, index), index)
}

export function writeCellSource(notebook: Notebook, cell: string | number, source: string): Notebook {
	const index = findCellIndexBySelector(notebook, cell)
	const current = cellAt(notebook, index)
	notebook.cells[index] = {
		...current,
		source
	}
	return notebook
}

function findUniqueMatch(haystack: string, needle: string): { start: number; end: number } {
	const start = haystack.indexOf(needle)
	if (start === -1) throw new Error(`Edit text not found: ${JSON.stringify(needle)}`)
	if (haystack.indexOf(needle, start + 1) !== -1) {
		throw new Error(`Edit text is ambiguous: ${JSON.stringify(needle)}`)
	}
	return { start, end: start + needle.length }
}

export function applyExactSourceEdits(source: string, edits: NotebookSourceEdit[]): string {
	const matches = edits.map(edit => ({ ...edit, ...findUniqueMatch(source, edit.oldText) }))
	const sorted = [...matches].sort((a, b) => a.start - b.start)

	for (let index = 1; index < sorted.length; index += 1) {
		const current = sorted[index]
		const previous = sorted[index - 1]
		if (current === undefined || previous === undefined) throw new Error("Edit ranges overlap")
		if (current.start < previous.end) {
			throw new Error("Edit ranges overlap")
		}
	}

	let cursor = 0
	let result = ""
	for (const match of sorted) {
		result += source.slice(cursor, match.start)
		result += match.newText
		cursor = match.end
	}
	result += source.slice(cursor)
	return result
}

export function editCellSource(notebook: Notebook, cell: string | number, edits: NotebookSourceEdit[]): Notebook {
	const index = findCellIndexBySelector(notebook, cell)
	notebook.cells[index] = {
		...cellAt(notebook, index),
		source: applyExactSourceEdits(readCell(cellAt(notebook, index), index).source, edits)
	}
	return notebook
}

export function insertCell(notebook: Notebook, target: NotebookInsertTarget, cell: NotebookInsertCell): NotebookReadCell {
	if ((target.cellId === undefined) === (target.index === undefined)) {
		throw new Error("Provide exactly one of cellId or index")
	}

	const targetIndex = target.index as number | undefined
	const anchorIndex =
		target.cellId !== undefined
			? findCellIndexById(notebook, target.cellId)
			: targetIndex === -1
				? -1
				: cellIndexFromUserIndex(notebook, targetIndex as number)

	const insertIndex = anchorIndex === -1 ? notebook.cells.length : anchorIndex + (target.direction === "after" ? 1 : 0)
	const id = notebook.nbformat_minor >= 5 || notebook.cells.some(cell => storedCellId(cell)) ? createCellId(notebook) : undefined
	const nextCell: NotebookCell = {
		cell_type: cell.type,
		...(id === undefined ? {} : { id }),
		metadata: {},
		source: cell.source
	}

	if (cell.type === "code") {
		nextCell.execution_count = null
		nextCell.outputs = []
	}

	notebook.cells.splice(insertIndex, 0, nextCell)
	return readCell(cellAt(notebook, insertIndex), insertIndex)
}

export function deleteCell(notebook: Notebook, cell: string | number): NotebookReadCell {
	const index = findCellIndexBySelector(notebook, cell)
	const deleted = readCell(cellAt(notebook, index), index)
	notebook.cells.splice(index, 1)
	return deleted
}

export function moveCell(
	notebook: Notebook,
	cell: string | number,
	target: string | number,
	direction: "before" | "after"
): NotebookReadCell {
	const fromIndex = findCellIndexBySelector(notebook, cell)
	const targetIndex = typeof target === "number" && target === -1 ? notebook.cells.length - 1 : findCellIndexBySelector(notebook, target)

	if (targetIndex === fromIndex) {
		throw new Error("Cannot move a cell relative to itself")
	}

	const movedCell = cellAt(notebook, fromIndex)
	notebook.cells.splice(fromIndex, 1)
	const anchorIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex
	const insertIndex = direction === "before" ? anchorIndex : anchorIndex + 1
	notebook.cells.splice(insertIndex, 0, movedCell)
	return readCell(cellAt(notebook, insertIndex), insertIndex)
}

export function mergeCell(notebook: Notebook, cell: string | number, direction: "above" | "below"): NotebookMergeResult {
	const anchorIndex = findCellIndexBySelector(notebook, cell)
	const otherIndex = anchorIndex + (direction === "above" ? -1 : 1)

	if (otherIndex < 0 || otherIndex >= notebook.cells.length) {
		throw new Error(`No cell to merge ${direction} from ${cell}`)
	}

	const anchor = cellAt(notebook, anchorIndex)
	const other = cellAt(notebook, otherIndex)
	if (anchor.cell_type !== other.cell_type) {
		throw new Error(`Cannot merge ${anchor.cell_type} cell with ${other.cell_type} cell`)
	}

	const source =
		direction === "above"
			? joinCellSources(normalizeSource(other.source), normalizeSource(anchor.source))
			: joinCellSources(normalizeSource(anchor.source), normalizeSource(other.source))

	notebook.cells[anchorIndex] = { ...anchor, source }
	notebook.cells.splice(otherIndex, 1)
	const mergedIndex = direction === "above" ? anchorIndex - 1 : anchorIndex

	return {
		merged: readCell(cellAt(notebook, mergedIndex), mergedIndex),
		removed: readCell(other, otherIndex)
	}
}

export interface NotebookReadOutput {
	cellIndex: number
	cellId?: string
	outputIndex: number
	outputType: string
	mime: string
	text?: string
	imageData?: string
	images?: Array<{ mime: string; data: string }>
}

export function readCellOutput(notebook: Notebook, cell: string | number, outputIndex: number, mime?: string): NotebookReadOutput {
	const index = findCellIndexBySelector(notebook, cell)
	const cellData = cellAt(notebook, index)
	const cellId = storedCellId(cellData)

	if (cellData.cell_type !== "code") {
		throw new Error(`Cell ${cell} is not a code cell`)
	}

	const outputs = Array.isArray(cellData.outputs) ? cellData.outputs : []
	if (!Number.isInteger(outputIndex) || outputIndex < 1 || outputIndex > outputs.length) {
		throw new Error(`Output index out of range: ${outputIndex} (cell has ${outputs.length} outputs)`)
	}

	const arrayOutputIndex = outputIndex - 1
	const output = outputs[arrayOutputIndex]
	if (!isObject(output)) {
		throw new Error(`Output ${outputIndex} is not an object`)
	}

	const raw = output as RawOutput
	const outputType = typeof raw.output_type === "string" ? raw.output_type : "unknown"
	const base = {
		cellIndex: index + 1,
		...(cellId === undefined ? {} : { cellId }),
		outputIndex,
		outputType
	}

	if (outputType === "stream") {
		return {
			...base,
			mime: "text/plain",
			text: normalizeOutputText(raw.text)
		}
	}

	if (outputType === "error") {
		const traceback = Array.isArray(raw.traceback) ? raw.traceback.filter((line): line is string => typeof line === "string") : []
		return {
			...base,
			mime: "text/plain",
			text: traceback.join("\n")
		}
	}

	if (outputType === "display_data" || outputType === "execute_result") {
		if (!isObject(raw.data)) {
			throw new Error(`Output ${outputIndex} has no data`)
		}
		const data = raw.data

		const mimeTypes = Object.keys(data)
		if (mimeTypes.length === 0) {
			throw new Error(`Output ${outputIndex} has no mime types`)
		}

		let selectedMime = mime
		if (selectedMime === undefined && mimeTypes.length === 1) {
			selectedMime = mimeTypes[0]
		}
		if (selectedMime === undefined) {
			const textMimes = mimeTypes.filter(mt => !(mt.startsWith("image/") && mt !== "image/svg+xml"))
			const imageMimes = mimeTypes.filter(mt => mt.startsWith("image/") && mt !== "image/svg+xml")
			const text =
				textMimes.length > 0 ? textMimes.map(mt => `<output mime="${mt}" />\n${normalizeOutputText(data[mt])}`).join("\n") : undefined
			const images = imageMimes.map(mt => {
				const value = data[mt]
				return { mime: mt, data: typeof value === "string" ? value : Array.isArray(value) ? value.join("") : "" }
			})
			if (text === undefined && images.length === 0) {
				throw new Error(`Output ${outputIndex} has no displayable content`)
			}
			return {
				...base,
				mime: [...textMimes, ...imageMimes].join(", "),
				...(text === undefined ? {} : { text }),
				...(images.length > 0 ? { images } : {})
			}
		}

		if (!(selectedMime in data)) {
			throw new Error(`Mime type "${selectedMime}" not found in output ${outputIndex}. Available: ${mimeTypes.join(", ")}`)
		}

		const value = data[selectedMime]
		const isImage = selectedMime.startsWith("image/") && selectedMime !== "image/svg+xml"

		if (isImage) {
			const data = typeof value === "string" ? value : Array.isArray(value) ? value.join("") : ""
			return {
				...base,
				mime: selectedMime,
				imageData: data
			}
		}

		return {
			...base,
			mime: selectedMime,
			text: normalizeOutputText(value)
		}
	}

	throw new Error(`Unknown output type: ${outputType}`)
}

const dataUriRe = /data:(image\/[a-zA-Z+.-]+);base64,([A-Za-z0-9+/=]+)/g

export function extractDataUriImages(source: string): { text: string; images: Array<{ mime: string; data: string }> } {
	const images: Array<{ mime: string; data: string }> = []
	const text = source.replace(dataUriRe, (_match, mime, data) => {
		images.push({ mime, data })
		return `[image: ${mime}]`
	})
	return { text, images }
}

export function readCellAttachment(notebook: Notebook, cell: string | number, key: string): { mime: string; data: string } {
	const index = findCellIndexBySelector(notebook, cell)
	const cellData = cellAt(notebook, index)

	const attachments = cellData.attachments
	if (!isObject(attachments) || !(key in attachments)) {
		throw new Error(`Attachment "${key}" not found in cell ${cell}`)
	}

	const attachment = attachments[key]
	if (!isObject(attachment)) {
		throw new Error(`Attachment "${key}" is not an object`)
	}

	const mimes = Object.keys(attachment).filter(m => m.startsWith("image/"))
	if (mimes.length === 0) {
		throw new Error(`Attachment "${key}" has no image data. Available: ${Object.keys(attachment).join(", ")}`)
	}

	const mime = mimes[0]
	if (mime === undefined) throw new Error(`Attachment "${key}" has no image data. Available: ${Object.keys(attachment).join(", ")}`)
	const value = attachment[mime]
	const data = typeof value === "string" ? value : Array.isArray(value) ? value.join("") : ""

	return { mime, data }
}

export function clearCellOutputs(notebook: Notebook, cell: string | number): NotebookReadCell {
	const index = findCellIndexBySelector(notebook, cell)
	const current = cellAt(notebook, index)
	if (current.cell_type !== "code") throw new Error(`Cell is not code: ${cell}`)
	notebook.cells[index] = { ...current, outputs: [] }
	return readCell(cellAt(notebook, index), index)
}
