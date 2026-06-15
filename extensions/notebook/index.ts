import { isAbsolute, resolve } from "node:path"
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent"
import { withFileMutationQueue } from "@mariozechner/pi-coding-agent"
import {
	notebookClearOutputsParams,
	notebookDeleteParams,
	notebookEditCellParams,
	notebookInsertParams,
	notebookMergeParams,
	notebookMoveParams,
	notebookReadCellAttachmentParams,
	notebookReadCellParams,
	notebookReadOutputParams,
	notebookSummaryParams,
	notebookWriteCellParams,
	runNotebookClearOutputs,
	runNotebookDelete,
	runNotebookEditCell,
	runNotebookInsert,
	runNotebookMerge,
	runNotebookMove,
	runNotebookReadCell,
	runNotebookReadCellAttachment,
	runNotebookReadOutput,
	runNotebookSummary,
	runNotebookWriteCell
} from "./tools"

// Some models include a leading @ in path arguments; built-in tools strip it.
// Keep this aligned with pi docs/extensions.md path-tool guidance.
function normalizeNotebookPath(rawPath: string, cwd: string): string {
	const stripped = rawPath.startsWith("@") ? rawPath.slice(1) : rawPath
	return isAbsolute(stripped) ? stripped : resolve(cwd, stripped)
}

export default function notebookExtension(pi: ExtensionAPI) {
	const notebookToolGuidelines = [
		"Notebook tools: use notebook_summary first to discover structure and cell ids.",
		"Notebook tools: cell index selectors are 1-based; for notebooks without stored cell ids, use index selectors.",
		"notebook_edit_cell: replacements must match exactly and uniquely.",
		"notebook_insert: index -1 appends.",
		"notebook_move: targetIndex -1 means the end.",
		"notebook_merge: cells must be adjacent and the same type; the anchor cell id is preserved.",
		"notebook_clear_outputs: preserves source and execution count."
	]

	pi.registerTool({
		name: "notebook_summary",
		label: "Notebook Summary",
		description: "Summarize a Jupyter notebook by cell.",
		promptSnippet: "Discover existing cells",
		promptGuidelines: notebookToolGuidelines,
		parameters: notebookSummaryParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runNotebookSummary({ path: normalizeNotebookPath(params.path, ctx.cwd) })
		}
	})

	pi.registerTool({
		name: "notebook_read_cell",
		label: "Notebook Read Cell",
		description: "Read one notebook cell source.",
		promptSnippet: "Read one notebook cell source, optionally by line slice.",
		parameters: notebookReadCellParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runNotebookReadCell({ ...params, path: normalizeNotebookPath(params.path, ctx.cwd) })
		}
	})

	pi.registerTool({
		name: "notebook_write_cell",
		label: "Notebook Write Cell",
		description: "Replace one notebook cell source.",
		promptSnippet: "Replace one notebook cell source.",
		parameters: notebookWriteCellParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const path = normalizeNotebookPath(params.path, ctx.cwd)
			return withFileMutationQueue(path, () => runNotebookWriteCell({ ...params, path }))
		}
	})

	pi.registerTool({
		name: "notebook_edit_cell",
		label: "Notebook Edit Cell",
		description: "Apply exact source replacements within one notebook cell.",
		promptSnippet: "Edit part of one notebook cell with exact text replacements.",
		parameters: notebookEditCellParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const path = normalizeNotebookPath(params.path, ctx.cwd)
			return withFileMutationQueue(path, () => runNotebookEditCell({ ...params, path }))
		}
	})

	pi.registerTool({
		name: "notebook_insert",
		label: "Notebook Insert",
		description: "Insert one notebook cell near an anchor.",
		promptSnippet: "Insert a new code, markdown, or raw cell near an existing anchor.",
		parameters: notebookInsertParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const path = normalizeNotebookPath(params.path, ctx.cwd)
			return withFileMutationQueue(path, () => runNotebookInsert({ ...params, path }))
		}
	})

	pi.registerTool({
		name: "notebook_delete",
		label: "Notebook Delete",
		description: "Delete one notebook cell.",
		promptSnippet: "Delete one notebook cell.",
		parameters: notebookDeleteParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const path = normalizeNotebookPath(params.path, ctx.cwd)
			return withFileMutationQueue(path, () => runNotebookDelete({ ...params, path }))
		}
	})

	pi.registerTool({
		name: "notebook_move",
		label: "Notebook Move",
		description: "Move one notebook cell relative to another.",
		promptSnippet: "Move one notebook cell before or after another.",
		parameters: notebookMoveParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const path = normalizeNotebookPath(params.path, ctx.cwd)
			return withFileMutationQueue(path, () => runNotebookMove({ ...params, path }))
		}
	})

	pi.registerTool({
		name: "notebook_merge",
		label: "Notebook Merge",
		description: "Merge one notebook cell with an adjacent cell.",
		promptSnippet: "Merge one notebook cell with the cell above or below.",
		parameters: notebookMergeParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const path = normalizeNotebookPath(params.path, ctx.cwd)
			return withFileMutationQueue(path, () => runNotebookMerge({ ...params, path }))
		}
	})

	pi.registerTool({
		name: "notebook_clear_outputs",
		label: "Notebook Clear Outputs",
		description: "Clear outputs from one code cell.",
		promptSnippet: "Remove outputs from one code cell.",
		parameters: notebookClearOutputsParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const path = normalizeNotebookPath(params.path, ctx.cwd)
			return withFileMutationQueue(path, () => runNotebookClearOutputs({ ...params, path }))
		}
	})

	pi.registerTool({
		name: "notebook_read_cell_output",
		label: "Notebook Read Cell Output",
		description: "Read one output from a code cell. Supports text and image outputs.",
		promptSnippet: "Read a specific cell output by index. Use notebook_summary first to discover available outputs and their mime types.",
		parameters: notebookReadOutputParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runNotebookReadOutput({ ...params, path: normalizeNotebookPath(params.path, ctx.cwd) })
		}
	})

	pi.registerTool({
		name: "notebook_read_cell_attachment",
		label: "Notebook Read Cell Attachment",
		description: "Read an image attachment from a cell by its key.",
		promptSnippet: "Read a cell attachment image. Use notebook_summary first to discover available attachment keys (atts attribute).",
		parameters: notebookReadCellAttachmentParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runNotebookReadCellAttachment({ ...params, path: normalizeNotebookPath(params.path, ctx.cwd) })
		}
	})
}
