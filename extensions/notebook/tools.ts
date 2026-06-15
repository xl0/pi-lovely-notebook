import { StringEnum } from "@mariozechner/pi-ai"
import { type Static, Type } from "typebox"
import type { Notebook, PersistedCellId } from "./notebook"
import {
	clearCellOutputs,
	deleteCell,
	editCellSource,
	ensureCellIds,
	extractDataUriImages,
	formatNotebookSummary,
	insertCell,
	loadNotebook,
	mergeCell,
	moveCell,
	readAllCells,
	readCellAttachment,
	readCellById,
	readCellOutput,
	saveNotebook,
	sliceCellSource,
	summarizeNotebook,
	writeCellSource
} from "./notebook"

export const notebookSummaryParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." })
})

export const notebookReadCellParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Cell id to read." })),
	index: Type.Optional(Type.Integer({ description: "1-based cell index to read." })),
	lineOffset: Type.Optional(Type.Integer({ description: "Inclusive source line offset within the cell." })),
	lineLimit: Type.Optional(Type.Integer({ description: "Maximum number of source lines to read from the offset." }))
})

export const notebookWriteCellParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Cell id to replace." })),
	index: Type.Optional(Type.Integer({ description: "1-based cell index to replace." })),
	source: Type.String({ description: "New full cell source." })
})

export const notebookEditCellParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Cell id to edit." })),
	index: Type.Optional(Type.Integer({ description: "1-based cell index to edit." })),
	edits: Type.Array(
		Type.Object({
			oldText: Type.String({ description: "Exact text to replace." }),
			newText: Type.String({ description: "Replacement text." })
		}),
		{ minItems: 1 }
	)
})

export const notebookInsertParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Anchor cell id." })),
	index: Type.Optional(Type.Integer({ description: "1-based anchor cell index. Use -1 to append." })),
	direction: StringEnum(["before", "after"] as const, { description: "Insert before or after the anchor." }),
	type: StringEnum(["code", "markdown", "raw"] as const, { description: "New cell type." }),
	source: Type.String({ description: "Source for the new cell." })
})

export const notebookDeleteParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Cell id to delete." })),
	index: Type.Optional(Type.Integer({ description: "1-based cell index to delete." }))
})

export const notebookMoveParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Cell id to move." })),
	index: Type.Optional(Type.Integer({ description: "1-based cell index to move." })),
	targetCellId: Type.Optional(Type.String({ description: "Anchor cell id to move relative to." })),
	targetIndex: Type.Optional(Type.Integer({ description: "1-based anchor cell index to move relative to. Use -1 for the end." })),
	direction: StringEnum(["before", "after"] as const, {
		description: "Place the moved cell before or after the target."
	})
})

export const notebookMergeParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Anchor cell id to keep." })),
	index: Type.Optional(Type.Integer({ description: "1-based anchor cell index to keep." })),
	direction: StringEnum(["above", "below"] as const, { description: "Adjacent merge direction." })
})

export const notebookClearOutputsParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Code cell id whose outputs should be cleared." })),
	index: Type.Optional(Type.Integer({ description: "1-based code cell index whose outputs should be cleared." }))
})

export const notebookReadCellAttachmentParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Cell id." })),
	index: Type.Optional(Type.Integer({ description: "1-based cell index." })),
	key: Type.String({ description: "Attachment key (filename)." })
})

export const notebookReadOutputParams = Type.Object({
	path: Type.String({ description: "Path to an .ipynb notebook." }),
	cellId: Type.Optional(Type.String({ description: "Cell id to read output from." })),
	index: Type.Optional(Type.Integer({ description: "1-based cell index to read output from." })),
	outputIndex: Type.Integer({ description: "1-based index of the output within the cell." }),
	mime: Type.Optional(
		Type.String({
			description:
				"Mime type to select. Required for rich outputs (display_data/execute_result) with multiple variants. E.g. 'text/plain', 'image/png', 'image/svg+xml'."
		})
	),
	lineOffset: Type.Optional(Type.Integer({ description: "Inclusive line offset within the text output." })),
	lineLimit: Type.Optional(Type.Integer({ description: "Maximum number of lines to read from the offset." }))
})

export type NotebookSummaryParams = Static<typeof notebookSummaryParams>
export type NotebookReadCellParams = Static<typeof notebookReadCellParams>
export type NotebookWriteCellParams = Static<typeof notebookWriteCellParams>
export type NotebookEditCellParams = Static<typeof notebookEditCellParams>
export type NotebookInsertParams = Static<typeof notebookInsertParams>
export type NotebookDeleteParams = Static<typeof notebookDeleteParams>
export type NotebookMoveParams = Static<typeof notebookMoveParams>
export type NotebookMergeParams = Static<typeof notebookMergeParams>
export type NotebookClearOutputsParams = Static<typeof notebookClearOutputsParams>
export type NotebookReadOutputParams = Static<typeof notebookReadOutputParams>
export type NotebookReadCellAttachmentParams = Static<typeof notebookReadCellAttachmentParams>

export interface NotebookToolResult {
	content: Array<
		{ type: "text"; text: string; data?: never; mimeType?: never } | { type: "image"; data: string; mimeType: string; text?: never }
	>
	details: unknown
}

function formatAssignedIds(notebookPath: string, assigned: PersistedCellId[]): string {
	if (assigned.length === 0) return ""
	return `\nAssigned ids in ${notebookPath}: ${assigned.map(({ index, id }) => `${index}=${id}`).join(" ")}`
}

function selectorText(selector: string | number): string {
	return typeof selector === "string" ? selector : `index ${selector}`
}

function userIndexToArrayIndex(notebook: Awaited<ReturnType<typeof loadNotebook>>, index: number): number {
	if (!Number.isInteger(index) || index < 1 || index > notebook.cells.length) throw new Error(`Cell index out of range: ${index}`)
	return index - 1
}

async function mutateNotebook<T>(path: string, mutate: (notebook: Notebook) => T): Promise<{ assigned: PersistedCellId[]; result: T }> {
	const notebook = await loadNotebook(path)
	const assigned = ensureCellIds(notebook)
	const result = mutate(notebook)
	await saveNotebook(path, notebook)
	return { assigned, result }
}

function requireSingleCellSelector(cellId?: string, index?: number): string | number {
	if ((cellId === undefined) === (index === undefined)) {
		throw new Error("Provide exactly one cell selector: cellId or index")
	}
	return cellId ?? (index as number)
}

function requireReadCellAtIndex(notebook: Awaited<ReturnType<typeof loadNotebook>>, index: number) {
	const cell = readAllCells(notebook)[userIndexToArrayIndex(notebook, index)]
	if (cell === undefined) throw new Error(`Cell index out of range: ${index}`)
	return cell
}

export async function runNotebookSummary(params: NotebookSummaryParams): Promise<NotebookToolResult> {
	const notebook = await loadNotebook(params.path)
	const summary = summarizeNotebook(params.path, notebook)
	return {
		content: [{ type: "text", text: formatNotebookSummary(summary) }],
		details: summary
	}
}

export async function runNotebookReadCell(params: NotebookReadCellParams): Promise<NotebookToolResult> {
	const notebook = await loadNotebook(params.path)
	const selector = requireSingleCellSelector(params.cellId, params.index)
	const result = typeof selector === "string" ? readCellById(notebook, selector) : requireReadCellAtIndex(notebook, selector)
	const sliced = sliceCellSource(result.source, params.lineOffset, params.lineLimit)

	if (result.type === "markdown") {
		const { text, images } = extractDataUriImages(sliced)
		const content: NotebookToolResult["content"] = [{ type: "text", text }]
		for (const img of images) {
			content.push({ type: "image", data: img.data, mimeType: img.mime })
		}
		return { content, details: result }
	}

	return {
		content: [{ type: "text", text: sliced }],
		details: result
	}
}

export async function runNotebookWriteCell(params: NotebookWriteCellParams): Promise<NotebookToolResult> {
	const selector = requireSingleCellSelector(params.cellId, params.index)
	const { assigned, result } = await mutateNotebook(params.path, notebook => {
		writeCellSource(notebook, selector, params.source)
		return typeof selector === "string" ? readCellById(notebook, selector) : requireReadCellAtIndex(notebook, selector)
	})
	return {
		content: [{ type: "text", text: `Wrote cell ${selectorText(selector)} in ${params.path}.${formatAssignedIds(params.path, assigned)}` }],
		details: result
	}
}

export async function runNotebookEditCell(params: NotebookEditCellParams): Promise<NotebookToolResult> {
	const selector = requireSingleCellSelector(params.cellId, params.index)
	const { assigned, result } = await mutateNotebook(params.path, notebook => {
		editCellSource(notebook, selector, params.edits)
		return typeof selector === "string" ? readCellById(notebook, selector) : requireReadCellAtIndex(notebook, selector)
	})
	return {
		content: [
			{
				type: "text",
				text: `Successfully replaced ${params.edits.length} block(s) in cell ${selectorText(selector)} of ${params.path}.${formatAssignedIds(params.path, assigned)}`
			}
		],
		details: result
	}
}

export async function runNotebookInsert(params: NotebookInsertParams): Promise<NotebookToolResult> {
	const { assigned, result } = await mutateNotebook(params.path, notebook =>
		insertCell(
			notebook,
			{
				direction: params.direction,
				...(params.cellId === undefined ? {} : { cellId: params.cellId }),
				...(params.index === undefined ? {} : { index: params.index })
			},
			{ type: params.type, source: params.source }
		)
	)
	const anchor = params.cellId ?? (params.index === -1 ? "the end" : `index ${params.index}`)
	const placement = params.index === -1 ? "at" : params.direction
	return {
		content: [
			{
				type: "text",
				text: `Inserted cell ${result.id} ${placement} ${anchor} in ${params.path}.${formatAssignedIds(params.path, assigned)}`
			}
		],
		details: result
	}
}

export async function runNotebookDelete(params: NotebookDeleteParams): Promise<NotebookToolResult> {
	const selector = requireSingleCellSelector(params.cellId, params.index)
	const { assigned, result } = await mutateNotebook(params.path, notebook => deleteCell(notebook, selector))
	return {
		content: [
			{ type: "text", text: `Deleted cell ${selectorText(selector)} from ${params.path}.${formatAssignedIds(params.path, assigned)}` }
		],
		details: result
	}
}

export async function runNotebookMove(params: NotebookMoveParams): Promise<NotebookToolResult> {
	const selector = requireSingleCellSelector(params.cellId, params.index)
	const target = requireSingleCellSelector(params.targetCellId, params.targetIndex)
	const { assigned, result } = await mutateNotebook(params.path, notebook => moveCell(notebook, selector, target, params.direction))
	const targetText = typeof target === "string" ? target : target === -1 ? "the end" : `index ${target}`
	return {
		content: [
			{
				type: "text",
				text: `Moved cell ${selectorText(selector)} ${params.direction} ${targetText} in ${params.path}.${formatAssignedIds(params.path, assigned)}`
			}
		],
		details: result
	}
}

export async function runNotebookMerge(params: NotebookMergeParams): Promise<NotebookToolResult> {
	const selector = requireSingleCellSelector(params.cellId, params.index)
	const { assigned, result } = await mutateNotebook(params.path, notebook => mergeCell(notebook, selector, params.direction))
	return {
		content: [
			{
				type: "text",
				text: `Merged cell ${result.removed.id ?? `index ${result.removed.index}`} into ${selectorText(selector)} in ${params.path}.${formatAssignedIds(params.path, assigned)}`
			}
		],
		details: result
	}
}

export async function runNotebookReadOutput(params: NotebookReadOutputParams): Promise<NotebookToolResult> {
	const notebook = await loadNotebook(params.path)
	const selector = requireSingleCellSelector(params.cellId, params.index)
	const result = readCellOutput(notebook, selector, params.outputIndex, params.mime)

	if (result.imageData !== undefined) {
		return {
			content: [{ type: "image", data: result.imageData, mimeType: result.mime }],
			details: result
		}
	}

	const content: NotebookToolResult["content"] = []
	if (result.text !== undefined) {
		const sliced = sliceCellSource(result.text, params.lineOffset, params.lineLimit)
		content.push({ type: "text", text: sliced })
	}
	for (const img of result.images ?? []) {
		content.push({ type: "image", data: img.data, mimeType: img.mime })
	}
	return { content, details: result }
}

export async function runNotebookReadCellAttachment(params: NotebookReadCellAttachmentParams): Promise<NotebookToolResult> {
	const notebook = await loadNotebook(params.path)
	const selector = requireSingleCellSelector(params.cellId, params.index)
	const result = readCellAttachment(notebook, selector, params.key)
	return {
		content: [{ type: "image", data: result.data, mimeType: result.mime }],
		details: result
	}
}

export async function runNotebookClearOutputs(params: NotebookClearOutputsParams): Promise<NotebookToolResult> {
	const selector = requireSingleCellSelector(params.cellId, params.index)
	const { assigned, result } = await mutateNotebook(params.path, notebook => clearCellOutputs(notebook, selector))
	return {
		content: [
			{
				type: "text",
				text: `Cleared outputs for cell ${selectorText(selector)} in ${params.path}.${formatAssignedIds(params.path, assigned)}`
			}
		],
		details: result
	}
}

export const notebookToolRunners = {
	notebook_summary: runNotebookSummary,
	notebook_read_cell: runNotebookReadCell,
	notebook_write_cell: runNotebookWriteCell,
	notebook_edit_cell: runNotebookEditCell,
	notebook_insert: runNotebookInsert,
	notebook_delete: runNotebookDelete,
	notebook_move: runNotebookMove,
	notebook_merge: runNotebookMerge,
	notebook_clear_outputs: runNotebookClearOutputs,
	notebook_read_cell_output: runNotebookReadOutput,
	notebook_read_cell_attachment: runNotebookReadCellAttachment
} as const

export type NotebookToolName = keyof typeof notebookToolRunners
