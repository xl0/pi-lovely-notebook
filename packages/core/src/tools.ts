import { type Static, type TUnsafe, Type } from "typebox"
import type { Notebook } from "./notebook"
import {
	changeCellType,
	clearCellOutputs,
	createNotebook,
	deleteCell,
	editCellSource,
	extractDataUriImages,
	formatNotebookSummary,
	insertCell,
	isBinaryImageMime,
	loadNotebook,
	mergeCell,
	moveCell,
	readCellAtIndex,
	readCellAttachment,
	readCellOutput,
	resolveCellIndex,
	saveNewNotebook,
	saveNotebook,
	sliceCellSource,
	summarizeNotebook,
	writeCellSource
} from "./notebook"

export interface NotebookTextContent {
	type: "text"
	text: string
}

export interface NotebookImageContent {
	type: "image"
	/** Base64-encoded image data, unresized; adapters resize or cap before sending to a model. */
	data: string
	mimeType: string
}

export type NotebookToolContent = (NotebookTextContent | NotebookImageContent)[]

/** Model guidance shared by all adapters (pi prompt guidelines, MCP server instructions). */
export const notebookToolGuidelines = [
	"Notebook tools: use notebook_summary first to discover structure and cell ids.",
	"Notebook tools: cell and output index selectors are 0-based, line offsets are 1-based like any file read; for notebooks without stored cell ids, use index selectors.",
	"notebook_change_cell_type and notebook_write_cell type changes clear fields incompatible with the target type.",
	"notebook_edit_cell: replacements must match exactly and uniquely.",
	"notebook_insert: index -1 appends.",
	"notebook_merge: cells must be adjacent and the same type; the anchor cell id and attachments of both cells are kept, the removed cell's outputs are dropped.",
	"notebook_clear_outputs: preserves source and execution count."
]

// String enum schema rendered as `type: "string"` + `enum`, not anyOf/const unions,
// for providers (e.g. Google) that reject the latter.
function StringEnum<T extends readonly string[]>(values: T, options?: { description?: string }): TUnsafe<T[number]> {
	return Type.Unsafe<T[number]>({
		type: "string",
		enum: values as unknown as string[],
		...(options?.description && { description: options.description })
	})
}

function pushImageContent(content: NotebookToolContent, image: { mime: string; data: string }, lineOffset?: number, lineLimit?: number) {
	if (isBinaryImageMime(image.mime)) {
		content.push({ type: "image", data: image.data, mimeType: image.mime })
		return
	}
	// SVG is markup: as image content it only makes the host's resizer fail with a misleading
	// "too large" note. nbformat stores it as text, JupyterLab base64s anything pasted; take both.
	const markup = image.data.trimStart().startsWith("<") ? image.data : Buffer.from(image.data, "base64").toString("utf8")
	content.push({ type: "text", text: sliceCellSource(markup, lineOffset, lineLimit) })
}

function cellSelectionText(cellId?: string, index?: number): string {
	return cellId ?? `index ${index}`
}

async function mutateNotebook<T>(path: string, mutate: (notebook: Notebook) => T): Promise<T> {
	const notebook = await loadNotebook(path)
	const result = mutate(notebook)
	await saveNotebook(path, notebook)
	return result
}

function resolveSelectedCellIndex(notebook: Notebook, cellId?: string, index?: number): number {
	if (cellId !== undefined && index === undefined) return resolveCellIndex(notebook, { cellId })
	if (index !== undefined && cellId === undefined) return resolveCellIndex(notebook, { index })
	throw new Error("Provide exactly one cell selector: cellId or index")
}

const notebookSummaryParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	lineOffset: Type.Optional(Type.Integer({ minimum: 1, description: "1-based line number to start reading the summary from." })),
	lineLimit: Type.Optional(Type.Integer({ minimum: 0, description: "Maximum number of summary lines to read from the offset." }))
})

async function runNotebookSummary(params: Static<typeof notebookSummaryParams>): Promise<NotebookToolContent> {
	const notebook = await loadNotebook(params.path)
	const summary = summarizeNotebook(notebook)
	return [{ type: "text", text: sliceCellSource(formatNotebookSummary(summary), params.lineOffset, params.lineLimit) }]
}

export const notebookSummaryTool = {
	name: "notebook_summary",
	description: "Summarize a Jupyter notebook by cell.",
	params: notebookSummaryParams,
	run: runNotebookSummary
} as const

const notebookCreateParams = Type.Object({
	path: Type.String({ description: "Path for the new .ipynb notebook." }),
	language: Type.Optional(
		Type.String({ description: "Notebook language (metadata.language_info.name), e.g. python or julia. Defaults to python." })
	)
})

async function runNotebookCreate(params: Static<typeof notebookCreateParams>): Promise<NotebookToolContent> {
	const language = params.language ?? "python"
	// Exclusive create, so an existing notebook is never clobbered by an empty one: the kernel
	// refuses atomically, with no window between checking and writing.
	await saveNewNotebook(params.path, createNotebook(language))
	return [{ type: "text", text: `Created notebook ${params.path} with language ${language}.` }]
}

export const notebookCreateTool = {
	name: "notebook_create",
	description: "Create a new empty Jupyter notebook. Fails if the path already exists.",
	params: notebookCreateParams,
	run: runNotebookCreate
} as const

const notebookReadCellParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Cell id to read." })),
	index: Type.Optional(Type.Integer({ minimum: 0, description: "0-based cell index to read." })),
	lineOffset: Type.Optional(Type.Integer({ minimum: 1, description: "1-based line number to start reading the cell source from." })),
	lineLimit: Type.Optional(Type.Integer({ minimum: 0, description: "Maximum number of source lines to read from the offset." })),
	includeImages: Type.Optional(Type.Boolean({ description: "Whether to include image content. Defaults to true." }))
})

async function runNotebookReadCell(params: Static<typeof notebookReadCellParams>): Promise<NotebookToolContent> {
	const notebook = await loadNotebook(params.path)
	const result = readCellAtIndex(notebook, resolveSelectedCellIndex(notebook, params.cellId, params.index))
	const sliced = sliceCellSource(result.source, params.lineOffset, params.lineLimit)

	if (result.type === "markdown") {
		const { text, images } = extractDataUriImages(sliced)
		const content: NotebookToolContent = [{ type: "text", text }]
		if (params.includeImages !== false) {
			for (const img of images) {
				pushImageContent(content, img)
			}
		}
		return content
	}

	return [{ type: "text", text: sliced }]
}

export const notebookReadCellTool = {
	name: "notebook_read_cell",
	description: "Read one notebook cell source.",
	params: notebookReadCellParams,
	run: runNotebookReadCell
} as const

const notebookWriteCellParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Cell id to replace." })),
	index: Type.Optional(Type.Integer({ minimum: 0, description: "0-based cell index to replace." })),
	type: Type.Optional(StringEnum(["code", "markdown", "raw"] as const, { description: "New cell type. Omit to preserve it." })),
	source: Type.String({ description: "New full cell source." })
})

async function runNotebookWriteCell(params: Static<typeof notebookWriteCellParams>): Promise<NotebookToolContent> {
	await mutateNotebook(params.path, notebook => {
		const cellIndex = resolveSelectedCellIndex(notebook, params.cellId, params.index)
		writeCellSource(notebook, cellIndex, params.source)
		if (params.type !== undefined) changeCellType(notebook, cellIndex, params.type)
	})
	const type = params.type === undefined ? "" : ` as ${params.type}`
	return [{ type: "text", text: `Wrote cell ${cellSelectionText(params.cellId, params.index)}${type} in ${params.path}.` }]
}

export const notebookWriteCellTool = {
	name: "notebook_write_cell",
	description: "Replace one notebook cell source and optionally change its type.",
	params: notebookWriteCellParams,
	run: runNotebookWriteCell
} as const

const notebookChangeCellTypeParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Cell id to change." })),
	index: Type.Optional(Type.Integer({ minimum: 0, description: "0-based cell index to change." })),
	type: StringEnum(["code", "markdown", "raw"] as const, { description: "New cell type." })
})

async function runNotebookChangeCellType(params: Static<typeof notebookChangeCellTypeParams>): Promise<NotebookToolContent> {
	await mutateNotebook(params.path, notebook =>
		changeCellType(notebook, resolveSelectedCellIndex(notebook, params.cellId, params.index), params.type)
	)
	return [
		{
			type: "text",
			text: `Changed cell ${cellSelectionText(params.cellId, params.index)} to ${params.type} in ${params.path}.`
		}
	]
}

export const notebookChangeCellTypeTool = {
	name: "notebook_change_cell_type",
	description: "Change one notebook cell type.",
	params: notebookChangeCellTypeParams,
	run: runNotebookChangeCellType
} as const

const notebookEditCellParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Cell id to edit." })),
	index: Type.Optional(Type.Integer({ minimum: 0, description: "0-based cell index to edit." })),
	edits: Type.Array(
		Type.Object({
			oldText: Type.String({ description: "Exact text to replace." }),
			newText: Type.String({ description: "Replacement text." })
		}),
		{ minItems: 1 }
	)
})

async function runNotebookEditCell(params: Static<typeof notebookEditCellParams>): Promise<NotebookToolContent> {
	await mutateNotebook(params.path, notebook => {
		editCellSource(notebook, resolveSelectedCellIndex(notebook, params.cellId, params.index), params.edits)
	})
	return [
		{
			type: "text",
			text: `Successfully replaced ${params.edits.length} block(s) in cell ${cellSelectionText(params.cellId, params.index)} of ${params.path}.`
		}
	]
}

export const notebookEditCellTool = {
	name: "notebook_edit_cell",
	description: "Apply exact source replacements within one notebook cell.",
	params: notebookEditCellParams,
	run: runNotebookEditCell
} as const

const notebookInsertParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Anchor cell id." })),
	index: Type.Optional(Type.Integer({ minimum: -1, description: "0-based anchor cell index. Use -1 to append." })),
	direction: StringEnum(["before", "after"] as const, { description: "Insert before or after the anchor." }),
	type: StringEnum(["code", "markdown", "raw"] as const, { description: "New cell type." }),
	source: Type.String({ description: "Source for the new cell." })
})

async function runNotebookInsert(params: Static<typeof notebookInsertParams>): Promise<NotebookToolContent> {
	const result = await mutateNotebook(params.path, notebook => {
		const insertIndex =
			params.cellId === undefined && params.index === -1
				? notebook.cells.length
				: resolveSelectedCellIndex(notebook, params.cellId, params.index) + (params.direction === "after" ? 1 : 0)
		return insertCell(notebook, insertIndex, { type: params.type, source: params.source })
	})
	const anchor = params.cellId ?? (params.index === -1 ? "the end" : `index ${params.index}`)
	const placement = params.index === -1 ? "at" : params.direction
	return [
		{
			type: "text",
			text: `Inserted cell ${result.id ?? `index ${result.index}`} ${placement} ${anchor} in ${params.path}.`
		}
	]
}

export const notebookInsertTool = {
	name: "notebook_insert",
	description: "Insert one notebook cell near an anchor.",
	params: notebookInsertParams,
	run: runNotebookInsert
} as const

const notebookDeleteParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Cell id to delete." })),
	index: Type.Optional(Type.Integer({ minimum: 0, description: "0-based cell index to delete." }))
})

async function runNotebookDelete(params: Static<typeof notebookDeleteParams>): Promise<NotebookToolContent> {
	await mutateNotebook(params.path, notebook => deleteCell(notebook, resolveSelectedCellIndex(notebook, params.cellId, params.index)))
	return [{ type: "text", text: `Deleted cell ${cellSelectionText(params.cellId, params.index)} from ${params.path}.` }]
}

export const notebookDeleteTool = {
	name: "notebook_delete",
	description: "Delete one notebook cell.",
	params: notebookDeleteParams,
	run: runNotebookDelete
} as const

const notebookMoveParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Cell id to move." })),
	index: Type.Optional(Type.Integer({ minimum: 0, description: "0-based cell index to move." })),
	targetCellId: Type.Optional(Type.String({ description: "Anchor cell id to move relative to." })),
	targetIndex: Type.Optional(Type.Integer({ minimum: 0, description: "0-based anchor cell index to move relative to." })),
	direction: StringEnum(["before", "after"] as const, {
		description: "Place the moved cell before or after the target."
	})
})

async function runNotebookMove(params: Static<typeof notebookMoveParams>): Promise<NotebookToolContent> {
	await mutateNotebook(params.path, notebook => {
		moveCell(
			notebook,
			resolveSelectedCellIndex(notebook, params.cellId, params.index),
			resolveSelectedCellIndex(notebook, params.targetCellId, params.targetIndex),
			params.direction
		)
	})
	return [
		{
			type: "text",
			text: `Moved cell ${cellSelectionText(params.cellId, params.index)} ${params.direction} ${cellSelectionText(params.targetCellId, params.targetIndex)} in ${params.path}.`
		}
	]
}

export const notebookMoveTool = {
	name: "notebook_move",
	description: "Move one notebook cell relative to another.",
	params: notebookMoveParams,
	run: runNotebookMove
} as const

const notebookMergeParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Anchor cell id to keep." })),
	index: Type.Optional(Type.Integer({ minimum: 0, description: "0-based anchor cell index to keep." })),
	direction: StringEnum(["above", "below"] as const, { description: "Adjacent merge direction." })
})

async function runNotebookMerge(params: Static<typeof notebookMergeParams>): Promise<NotebookToolContent> {
	const result = await mutateNotebook(params.path, notebook =>
		mergeCell(notebook, resolveSelectedCellIndex(notebook, params.cellId, params.index), params.direction)
	)
	const dropped = result.droppedOutputs === 0 ? "" : ` Dropped ${result.droppedOutputs} output(s) that belonged to the removed cell.`
	return [
		{
			type: "text",
			text: `Merged cell ${result.removed.id ?? `index ${result.removed.index}`} into ${cellSelectionText(params.cellId, params.index)} in ${params.path}.${dropped}`
		}
	]
}

export const notebookMergeTool = {
	name: "notebook_merge",
	description: "Merge one notebook cell with an adjacent cell.",
	params: notebookMergeParams,
	run: runNotebookMerge
} as const

const notebookReadOutputParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Cell id to read output from." })),
	index: Type.Optional(Type.Integer({ minimum: 0, description: "0-based cell index to read output from." })),
	outputIndex: Type.Optional(
		Type.Integer({ minimum: 0, description: "0-based index of the output within the cell. Omit when the cell has one output." })
	),
	mime: Type.Optional(
		Type.String({
			description:
				"Mime type to select from rich outputs (display_data/execute_result). If omitted, all displayable text and image variants are returned. E.g. 'text/plain', 'image/png', 'image/svg+xml'."
		})
	),
	lineOffset: Type.Optional(Type.Integer({ minimum: 1, description: "1-based line number to start reading the text output from." })),
	lineLimit: Type.Optional(Type.Integer({ minimum: 0, description: "Maximum number of lines to read from the offset." })),
	includeImages: Type.Optional(Type.Boolean({ description: "Whether to include image content. Defaults to true." }))
})

async function runNotebookReadOutput(params: Static<typeof notebookReadOutputParams>): Promise<NotebookToolContent> {
	const notebook = await loadNotebook(params.path)
	const result = readCellOutput(notebook, resolveSelectedCellIndex(notebook, params.cellId, params.index), params.outputIndex, params.mime)

	const content: NotebookToolContent = []
	if (result.text !== undefined) {
		const sliced = sliceCellSource(result.text, params.lineOffset, params.lineLimit)
		content.push({ type: "text", text: sliced })
	}
	const images = result.images ?? []
	if (params.includeImages !== false) {
		for (const img of images) {
			pushImageContent(content, img)
		}
	} else if (content.length === 0 && images.length > 0) {
		content.push({ type: "text", text: "[Images omitted: includeImages=false.]" })
	}
	return content
}

export const notebookReadOutputTool = {
	name: "notebook_read_cell_output",
	description: "Read one output from a code cell. Supports text and image outputs.",
	params: notebookReadOutputParams,
	run: runNotebookReadOutput
} as const

const notebookReadCellAttachmentParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Cell id." })),
	index: Type.Optional(Type.Integer({ minimum: 0, description: "0-based cell index." })),
	key: Type.String({ description: "Attachment key (filename)." }),
	lineOffset: Type.Optional(Type.Integer({ minimum: 1, description: "1-based line number, for text attachments such as SVG." })),
	lineLimit: Type.Optional(Type.Integer({ minimum: 0, description: "Maximum number of lines to read from the offset." }))
})

async function runNotebookReadCellAttachment(params: Static<typeof notebookReadCellAttachmentParams>): Promise<NotebookToolContent> {
	const notebook = await loadNotebook(params.path)
	const result = readCellAttachment(notebook, resolveSelectedCellIndex(notebook, params.cellId, params.index), params.key)
	const content: NotebookToolContent = []
	pushImageContent(content, result, params.lineOffset, params.lineLimit)
	return content
}

export const notebookReadCellAttachmentTool = {
	name: "notebook_read_cell_attachment",
	description: "Read an image attachment from a cell by its key.",
	params: notebookReadCellAttachmentParams,
	run: runNotebookReadCellAttachment
} as const

const notebookClearOutputsParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Code cell id whose outputs should be cleared." })),
	index: Type.Optional(Type.Integer({ minimum: 0, description: "0-based code cell index whose outputs should be cleared." }))
})

async function runNotebookClearOutputs(params: Static<typeof notebookClearOutputsParams>): Promise<NotebookToolContent> {
	await mutateNotebook(params.path, notebook => clearCellOutputs(notebook, resolveSelectedCellIndex(notebook, params.cellId, params.index)))
	return [
		{
			type: "text",
			text: `Cleared outputs for cell ${cellSelectionText(params.cellId, params.index)} in ${params.path}.`
		}
	]
}

export const notebookClearOutputsTool = {
	name: "notebook_clear_outputs",
	description: "Clear outputs from one code cell.",
	params: notebookClearOutputsParams,
	run: runNotebookClearOutputs
} as const
