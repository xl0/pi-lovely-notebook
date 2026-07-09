import { randomBytes } from "node:crypto"
import { readFile, writeFile } from "node:fs/promises"

export type NotebookCellType = "code" | "markdown" | "raw"
export type NotebookJson = string | number | boolean | null | NotebookJson[] | { [key: string]: NotebookJson }
export type NotebookMimeBundle = Record<string, NotebookJson>
export type NotebookAttachments = Record<string, NotebookMimeBundle>
export type NotebookOutputType = "stream" | "display_data" | "execute_result" | "error"

export interface NotebookStreamOutput {
	output_type: "stream"
	name?: string
	text?: string
}

export interface NotebookDisplayDataOutput {
	output_type: "display_data"
	data?: NotebookMimeBundle
	metadata?: Record<string, NotebookJson>
}

export interface NotebookExecuteResultOutput {
	output_type: "execute_result"
	data?: NotebookMimeBundle
	metadata?: Record<string, NotebookJson>
	// Output-level prompt number. Usually matches the parent code cell's execution_count, but nbformat stores both.
	execution_count?: number | null
}

export interface NotebookErrorOutput {
	output_type: "error"
	ename?: string
	evalue?: string
	traceback?: string[]
}

export type NotebookOutput = NotebookStreamOutput | NotebookDisplayDataOutput | NotebookExecuteResultOutput | NotebookErrorOutput

export interface NotebookCell {
	cell_type: NotebookCellType
	id?: string
	source: string
	metadata?: Record<string, NotebookJson>
	attachments?: NotebookAttachments
	execution_count?: number | null
	outputs?: NotebookOutput[]
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

export type NotebookCellSelector = { cellId: string; index?: never } | { cellId?: never; index: number }

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
	source?: unknown
	metadata?: unknown
	attachments?: unknown
	outputs?: unknown
}

type RawOutput = RawObject & {
	output_type?: unknown
	name?: unknown
	text?: unknown
	data?: unknown
	ename?: unknown
	evalue?: unknown
	execution_count?: unknown
	traceback?: unknown
	metadata?: unknown
}

function isObject(value: unknown): value is RawObject {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

function storedCellId(cell: NotebookCell): string | undefined {
	return typeof cell.id === "string" && cell.id.length > 0 ? cell.id : undefined
}

function cellAt(notebook: Notebook, index: number): NotebookCell {
	const cell = notebook.cells[index]
	if (cell === undefined) throw new Error(`Cell index out of range: ${index}`)
	return cell
}

function cellIndexFromUserIndex(notebook: Notebook, index: number): number {
	if (!Number.isInteger(index) || index < 0 || index >= notebook.cells.length) {
		throw new Error(`Cell index out of range: ${index}`)
	}
	return index
}

export function normalizeSource(source: unknown): string {
	if (typeof source === "string") return source
	if (Array.isArray(source)) return source.join("")
	return ""
}

function isNotebookCellType(value: unknown): value is NotebookCellType {
	return value === "code" || value === "markdown" || value === "raw"
}

function isNotebookOutputType(value: unknown): value is NotebookOutputType {
	return value === "stream" || value === "display_data" || value === "execute_result" || value === "error"
}

function isNotebookJson(value: unknown): value is NotebookJson {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true
	if (Array.isArray(value)) return value.every(isNotebookJson)
	return isObject(value) && Object.values(value).every(isNotebookJson)
}

function normalizeJsonObject(value: unknown, label: string): Record<string, NotebookJson> | undefined {
	if (value === undefined) return undefined
	if (!isObject(value)) throw new Error(`${label} must be an object`)
	const normalized: Record<string, NotebookJson> = {}
	for (const [key, item] of Object.entries(value)) {
		if (!isNotebookJson(item)) throw new Error(`${label} contains non-JSON value at ${JSON.stringify(key)}`)
		normalized[key] = item
	}
	return normalized
}

function normalizeAttachments(value: unknown, cellIndex: number): NotebookAttachments | undefined {
	if (value === undefined) return undefined
	if (!isObject(value)) throw new Error(`Cell ${cellIndex} attachments must be an object`)

	const attachments: NotebookAttachments = {}
	for (const [key, attachment] of Object.entries(value)) {
		if (!isObject(attachment)) throw new Error(`Attachment ${JSON.stringify(key)} in cell ${cellIndex} must be an object`)
		attachments[key] = normalizeJsonObject(attachment, `Attachment ${JSON.stringify(key)} in cell ${cellIndex}`) ?? {}
	}
	return attachments
}

function normalizeOutputs(value: unknown, cellIndex: number): NotebookOutput[] | undefined {
	if (value === undefined) return undefined
	if (!Array.isArray(value)) throw new Error(`Cell ${cellIndex} outputs must be an array`)

	return value.map((output, outputIndex) => {
		if (!isObject(output)) throw new Error(`Output ${outputIndex} in cell ${cellIndex} must be an object`)
		const raw = output as RawOutput
		if (typeof raw.output_type !== "string") throw new Error(`Output ${outputIndex} in cell ${cellIndex} is missing output_type`)
		if (!isNotebookOutputType(raw.output_type)) {
			throw new Error(`Unsupported output type in cell ${cellIndex} output ${outputIndex}: ${raw.output_type}`)
		}

		if (raw.output_type === "stream") {
			const { output_type: _outputType, name: _name, text: _text, ...rest } = raw
			return {
				...rest,
				output_type: raw.output_type,
				...(typeof raw.name === "string" ? { name: raw.name } : {}),
				...(raw.text === undefined ? {} : { text: normalizeOutputText(raw.text) })
			}
		}

		if (raw.output_type === "display_data") {
			const { output_type: _outputType, data: _data, metadata: _metadata, ...rest } = raw
			const data = normalizeJsonObject(raw.data, `Output ${outputIndex} in cell ${cellIndex} data`)
			const metadata = normalizeJsonObject(raw.metadata, `Output ${outputIndex} in cell ${cellIndex} metadata`)
			return {
				...rest,
				output_type: raw.output_type,
				...(data === undefined ? {} : { data }),
				...(metadata === undefined ? {} : { metadata })
			}
		}

		if (raw.output_type === "execute_result") {
			const { output_type: _outputType, data: _data, metadata: _metadata, execution_count: _executionCount, ...rest } = raw
			const data = normalizeJsonObject(raw.data, `Output ${outputIndex} in cell ${cellIndex} data`)
			const metadata = normalizeJsonObject(raw.metadata, `Output ${outputIndex} in cell ${cellIndex} metadata`)
			return {
				...rest,
				output_type: raw.output_type,
				...(data === undefined ? {} : { data }),
				...(metadata === undefined ? {} : { metadata }),
				...(typeof raw.execution_count === "number" || raw.execution_count === null ? { execution_count: raw.execution_count } : {})
			}
		}

		const { output_type: _outputType, ename: _ename, evalue: _evalue, traceback: _traceback, ...rest } = raw
		const traceback = Array.isArray(raw.traceback) ? raw.traceback.filter((line): line is string => typeof line === "string") : undefined
		return {
			...rest,
			output_type: raw.output_type,
			...(typeof raw.ename === "string" ? { ename: raw.ename } : {}),
			...(typeof raw.evalue === "string" ? { evalue: raw.evalue } : {}),
			...(traceback === undefined ? {} : { traceback })
		}
	})
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

function isBinaryImageMime(mime: string): boolean {
	return mime.startsWith("image/") && mime !== "image/svg+xml"
}

function isTextLikeMime(mime: string): boolean {
	return mime.startsWith("text/") || mime === "application/json"
}

function displayDataEntries(data: NotebookMimeBundle): Array<{ mime: string; text: string; image?: { mime: string; data: string } }> {
	return Object.entries(data).map(([mime, value]) => ({
		mime,
		text: normalizeOutputText(value),
		...(isBinaryImageMime(mime) ? { image: { mime, data: normalizeOutputText(value) } } : {})
	}))
}

function summarizeOutput(output: NotebookOutput, index: number): NotebookOutputSummary[] {
	const raw = output
	const type = raw.output_type
	const base = {
		index,
		type,
		...("name" in raw && typeof raw.name === "string" ? { name: raw.name } : {}),
		...("ename" in raw && typeof raw.ename === "string" ? { ename: raw.ename } : {}),
		...("execution_count" in raw && (typeof raw.execution_count === "number" || raw.execution_count === null)
			? { executionCount: raw.execution_count }
			: {})
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

	if ((type === "display_data" || type === "execute_result") && raw.data !== undefined) {
		return displayDataEntries(raw.data).map(entry => {
			const text = isTextLikeMime(entry.mime) ? entry.text : ""
			const preview = previewSource(text)
			return {
				...base,
				mime: entry.mime,
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
		index,
		...(id === undefined ? {} : { id }),
		type: cell.cell_type,
		source: cell.source,
		...(executionCount === undefined ? {} : { executionCount })
	}
}

export function resolveCellIndex(notebook: Notebook, selector: NotebookCellSelector): number {
	if (selector.cellId === undefined) return cellIndexFromUserIndex(notebook, selector.index)

	const index = notebook.cells.findIndex(cell => storedCellId(cell) === selector.cellId)
	if (index === -1) throw new Error(`Cell not found: ${selector.cellId}`)
	return index
}

export function parseNotebook(text: string): Notebook {
	const data: unknown = JSON.parse(text)
	if (!isObject(data)) throw new Error("Notebook root must be an object")
	const notebook = data as RawNotebook
	if (notebook.nbformat !== 4) throw new Error("Only nbformat 4 notebooks are supported")
	if (!Array.isArray(notebook.cells)) throw new Error("Notebook cells must be an array")

	const cells: NotebookCell[] = []
	for (const [index, cell] of notebook.cells.entries()) {
		if (!isObject(cell)) throw new Error(`Cell ${index} must be an object`)
		const rawCell = cell as RawCell
		if (typeof rawCell.cell_type !== "string") throw new Error(`Cell ${index} is missing cell_type`)
		if (!isNotebookCellType(rawCell.cell_type)) throw new Error(`Unsupported cell type in cell ${index}: ${rawCell.cell_type}`)
		const { attachments: _attachments, metadata: _metadata, outputs: _outputs, ...rest } = cell as RawObject
		const metadata = normalizeJsonObject(rawCell.metadata, `Cell ${index} metadata`)
		const attachments = normalizeAttachments(rawCell.attachments, index)
		const outputs = normalizeOutputs(rawCell.outputs, index)
		cells.push({
			...rest,
			cell_type: rawCell.cell_type,
			source: normalizeSource(rawCell.source),
			...(metadata === undefined ? {} : { metadata }),
			...(attachments === undefined ? {} : { attachments }),
			...(outputs === undefined ? {} : { outputs })
		})
	}

	return { ...notebook, cells } as Notebook
}

export async function loadNotebook(path: string): Promise<Notebook> {
	return parseNotebook(await readFile(path, "utf8"))
}

function serializeNotebook(notebook: Notebook): string {
	return `${JSON.stringify({ ...notebook, cells: notebook.cells.map(cell => ({ ...cell, source: sourceToLines(cell.source) })) }, null, 1)}\n`
}

export async function saveNotebook(path: string, notebook: Notebook): Promise<void> {
	await writeFile(path, serializeNotebook(notebook), "utf8")
}

export function createNotebook(language = "python3"): Notebook {
	return {
		cells: [],
		metadata: {
			language_info: { name: language }
		},
		nbformat: 4,
		nbformat_minor: 5
	}
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
			const source = cell.source
			const id = storedCellId(cell)
			const executionCount = cell.cell_type === "code" ? ((cell.execution_count as number | null | undefined) ?? null) : undefined
			const outputs = cell.cell_type === "code" && Array.isArray(cell.outputs) ? cell.outputs.flatMap(summarizeOutput) : undefined
			const outputCount = cell.cell_type === "code" ? (Array.isArray(cell.outputs) ? cell.outputs.length : 0) : undefined
			const attachmentKeys = isObject(cell.attachments) ? Object.keys(cell.attachments) : undefined
			const preview = previewSource(source)
			return {
				index,
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

export function readCellAtIndex(notebook: Notebook, cellIndex: number): NotebookReadCell {
	return readCell(cellAt(notebook, cellIndex), cellIndex)
}

export function writeCellSource(notebook: Notebook, cellIndex: number, source: string): Notebook {
	const current = cellAt(notebook, cellIndex)
	notebook.cells[cellIndex] = {
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

export function editCellSource(notebook: Notebook, cellIndex: number, edits: NotebookSourceEdit[]): Notebook {
	const cell = cellAt(notebook, cellIndex)
	notebook.cells[cellIndex] = {
		...cell,
		source: applyExactSourceEdits(cell.source, edits)
	}
	return notebook
}

export function insertCell(notebook: Notebook, insertIndex: number, cell: NotebookInsertCell): NotebookReadCell {
	if (!Number.isInteger(insertIndex) || insertIndex < 0 || insertIndex > notebook.cells.length)
		throw new Error(`Insert index out of range: ${insertIndex}`)
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

export function deleteCell(notebook: Notebook, cellIndex: number): NotebookReadCell {
	const deleted = readCell(cellAt(notebook, cellIndex), cellIndex)
	notebook.cells.splice(cellIndex, 1)
	return deleted
}

export function moveCell(notebook: Notebook, fromIndex: number, targetIndex: number, direction: "before" | "after"): NotebookReadCell {
	const movedCell = cellAt(notebook, fromIndex)
	cellAt(notebook, targetIndex)
	if (targetIndex === fromIndex) {
		throw new Error("Cannot move a cell relative to itself")
	}

	notebook.cells.splice(fromIndex, 1)
	const anchorIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex
	const insertIndex = direction === "before" ? anchorIndex : anchorIndex + 1
	notebook.cells.splice(insertIndex, 0, movedCell)
	return readCell(cellAt(notebook, insertIndex), insertIndex)
}

export function mergeCell(notebook: Notebook, anchorIndex: number, direction: "above" | "below"): NotebookMergeResult {
	const otherIndex = anchorIndex + (direction === "above" ? -1 : 1)

	if (otherIndex < 0 || otherIndex >= notebook.cells.length) {
		throw new Error(`No cell to merge ${direction} from index ${anchorIndex}`)
	}

	const anchor = cellAt(notebook, anchorIndex)
	const other = cellAt(notebook, otherIndex)
	if (anchor.cell_type !== other.cell_type) {
		throw new Error(`Cannot merge ${anchor.cell_type} cell with ${other.cell_type} cell`)
	}

	const source = direction === "above" ? joinCellSources(other.source, anchor.source) : joinCellSources(anchor.source, other.source)

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
	images?: Array<{ mime: string; data: string }>
}

export function readCellOutput(notebook: Notebook, cellIndex: number, outputIndex: number, mime?: string): NotebookReadOutput {
	const cellData = cellAt(notebook, cellIndex)
	const cellId = storedCellId(cellData)

	if (cellData.cell_type !== "code") {
		throw new Error(`Cell index ${cellIndex} is not a code cell`)
	}

	const outputs = Array.isArray(cellData.outputs) ? cellData.outputs : []
	if (!Number.isInteger(outputIndex) || outputIndex < 0 || outputIndex >= outputs.length) {
		throw new Error(`Output index out of range: ${outputIndex} (cell has ${outputs.length} outputs)`)
	}

	const output = outputs[outputIndex]
	if (output === undefined) throw new Error(`Output index out of range: ${outputIndex} (cell has ${outputs.length} outputs)`)

	const raw = output
	const outputType = raw.output_type
	const base = {
		cellIndex,
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
		const entries = displayDataEntries(data)
		if (selectedMime === undefined) {
			const textEntries = entries.filter(entry => entry.image === undefined)
			const text =
				textEntries.length > 0 ? textEntries.map(entry => `<output mime="${entry.mime}" />\n${entry.text}`).join("\n") : undefined
			const images = entries.flatMap(entry => (entry.image === undefined ? [] : [entry.image]))
			if (text === undefined && images.length === 0) {
				throw new Error(`Output ${outputIndex} has no displayable content`)
			}
			return {
				...base,
				mime: entries.map(entry => entry.mime).join(", "),
				...(text === undefined ? {} : { text }),
				...(images.length > 0 ? { images } : {})
			}
		}

		if (!(selectedMime in data)) {
			throw new Error(`Mime type "${selectedMime}" not found in output ${outputIndex}. Available: ${mimeTypes.join(", ")}`)
		}

		const value = data[selectedMime]
		const isImage = isBinaryImageMime(selectedMime)

		if (isImage) {
			const data = normalizeOutputText(value)
			return {
				...base,
				mime: selectedMime,
				images: [{ mime: selectedMime, data }]
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

export function readCellAttachment(notebook: Notebook, cellIndex: number, key: string): { mime: string; data: string } {
	const cellData = cellAt(notebook, cellIndex)

	const attachments = cellData.attachments
	if (!isObject(attachments) || !(key in attachments)) {
		throw new Error(`Attachment "${key}" not found in cell index ${cellIndex}`)
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

export function clearCellOutputs(notebook: Notebook, cellIndex: number): NotebookReadCell {
	const current = cellAt(notebook, cellIndex)
	if (current.cell_type !== "code") throw new Error(`Cell is not code: index ${cellIndex}`)
	notebook.cells[cellIndex] = { ...current, outputs: [] }
	return readCell(cellAt(notebook, cellIndex), cellIndex)
}
