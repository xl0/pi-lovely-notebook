import { isAbsolute, resolve } from "node:path"
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { keyHint, withFileMutationQueue } from "@earendil-works/pi-coding-agent"
import { Text } from "@earendil-works/pi-tui"
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

type NotebookRenderTheme = Parameters<NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["renderCall"]>>[1]
type NotebookRenderArgs = {
	path?: unknown
	cellId?: unknown
	index?: unknown
	targetCellId?: unknown
	targetIndex?: unknown
	outputIndex?: unknown
	mime?: unknown
	key?: unknown
	type?: unknown
	direction?: unknown
	lineOffset?: unknown
	lineLimit?: unknown
}
type NotebookToolResult = Awaited<ReturnType<typeof runNotebookSummary>>

function shortPath(path: unknown): string | undefined {
	if (typeof path !== "string" || path.length === 0) return undefined
	return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function formatArg(name: string, value: unknown): string | undefined {
	if (value === undefined || value === null || value === "") return undefined
	return `${name}=${String(value)}`
}

function renderNotebookCall(name: string, args: NotebookRenderArgs, theme: NotebookRenderTheme): Text {
	const parts = [
		shortPath(args.path),
		formatArg("cell", args.cellId ?? args.index),
		formatArg("target", args.targetCellId ?? args.targetIndex),
		formatArg("out", args.outputIndex),
		formatArg("mime", args.mime),
		formatArg("key", args.key),
		formatArg("type", args.type),
		formatArg("dir", args.direction),
		formatArg("offset", args.lineOffset),
		formatArg("limit", args.lineLimit)
	].filter(part => part !== undefined)

	const text =
		parts.length > 0
			? `${theme.fg("toolTitle", theme.bold(name))} ${theme.fg("dim", parts.join(" "))}`
			: theme.fg("toolTitle", theme.bold(name))
	return new Text(text, 0, 0)
}

function renderNotebookReadCall(name: string, args: NotebookRenderArgs, theme: NotebookRenderTheme): Text {
	const rawPath = shortPath(args.path)
	let pathDisplay = rawPath ? theme.fg("accent", rawPath) : theme.fg("toolOutput", "...")
	if (args.lineOffset !== undefined || args.lineLimit !== undefined) {
		const startLine = typeof args.lineOffset === "number" ? args.lineOffset : 1
		const endLine = typeof args.lineLimit === "number" ? startLine + args.lineLimit - 1 : ""
		pathDisplay += theme.fg("warning", `:${startLine}${endLine ? `-${endLine}` : ""}`)
	}

	const cell = formatArg("cell", args.cellId ?? args.index)
	const suffix = cell ? ` ${theme.fg("dim", cell)}` : ""
	return new Text(`${theme.fg("toolTitle", theme.bold(name))} ${pathDisplay}${suffix}`, 0, 0)
}

function renderNotebookTextResult(result: NotebookToolResult, expanded: boolean, theme: NotebookRenderTheme): Text {
	const output = result.content.find(item => item.type === "text")?.text ?? ""
	const lines = output.split("\n")
	let end = lines.length
	while (end > 0 && lines[end - 1] === "") end--

	const trimmed = lines.slice(0, end)
	const maxLines = expanded ? trimmed.length : 10
	const displayLines = trimmed.slice(0, maxLines)
	const remaining = trimmed.length - maxLines
	let text = `\n${displayLines.map(line => theme.fg("toolOutput", line)).join("\n")}`
	if (remaining > 0) text += `${theme.fg("muted", `\n... (${remaining} more lines,`)} ${keyHint("app.tools.expand", "to expand")})`
	return new Text(text, 0, 0)
}

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
		renderCall: (args, theme) => renderNotebookReadCall("notebook_summary", args, theme),
		renderResult: (result, { expanded }, theme) => renderNotebookTextResult(result, expanded, theme),
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
		renderCall: (args, theme) => renderNotebookReadCall("notebook_read_cell", args, theme),
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
		renderCall: (args, theme) => renderNotebookCall("notebook_write_cell", args, theme),
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
		renderCall: (args, theme) => renderNotebookCall("notebook_edit_cell", args, theme),
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
		renderCall: (args, theme) => renderNotebookCall("notebook_insert", args, theme),
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
		renderCall: (args, theme) => renderNotebookCall("notebook_delete", args, theme),
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
		renderCall: (args, theme) => renderNotebookCall("notebook_move", args, theme),
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
		renderCall: (args, theme) => renderNotebookCall("notebook_merge", args, theme),
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
		renderCall: (args, theme) => renderNotebookCall("notebook_clear_outputs", args, theme),
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
		renderCall: (args, theme) => renderNotebookCall("notebook_read_cell_output", args, theme),
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
		renderCall: (args, theme) => renderNotebookCall("notebook_read_cell_attachment", args, theme),
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			return runNotebookReadCellAttachment({ ...params, path: normalizeNotebookPath(params.path, ctx.cwd) })
		}
	})
}
