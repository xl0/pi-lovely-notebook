import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { generateDiffString, keyHint, renderDiff, resizeImage, withFileMutationQueue } from "@earendil-works/pi-coding-agent"
import { Text } from "@earendil-works/pi-tui"
import {
	applyExactSourceEdits,
	loadNotebook,
	type NotebookToolContent,
	normalizeNotebookPath,
	notebookChangeCellTypeTool,
	notebookClearOutputsTool,
	notebookCreateTool,
	notebookDeleteTool,
	notebookEditCellTool,
	notebookInsertTool,
	notebookMergeTool,
	notebookMoveTool,
	notebookReadCellAttachmentTool,
	notebookReadCellTool,
	notebookReadOutputTool,
	notebookSummaryTool,
	notebookToolGuidelines,
	notebookWriteCellTool,
	readCellAtIndex,
	resolveCellIndex
} from "@xl0/lovely-notebook"

type NotebookRenderTheme = Parameters<NonNullable<Parameters<ExtensionAPI["registerTool"]>[0]["renderCall"]>>[1]
type NotebookRenderArgs = {
	path?: string
	cellId?: string
	index?: number
	targetCellId?: string
	targetIndex?: number
	outputIndex?: number
	mime?: string
	key?: string
	type?: "code" | "markdown" | "raw"
	direction?: "before" | "after" | "above" | "below"
	lineOffset?: number
	lineLimit?: number
	includeImages?: boolean
	language?: string
}
type NotebookDiffDetails = ReturnType<typeof generateDiffString>
type NotebookToolRenderResult = { content: NotebookToolContent; details: NotebookDiffDetails | undefined }
type NotebookSourceMutationArgs = {
	cellId?: string
	index?: number
	source?: string
	edits?: Array<{ oldText: string; newText: string }>
}

// Core returns raw images; resize them into provider limits here, at the pi seam.
export async function resolveContentImages(content: NotebookToolContent): Promise<NotebookToolContent> {
	const resolved: NotebookToolContent = []
	for (const item of content) {
		if (item.type !== "image") {
			resolved.push(item)
			continue
		}
		const resized = await resizeImage(Buffer.from(item.data, "base64"), item.mimeType)
		if (resized) {
			resolved.push({ type: "image", data: resized.data, mimeType: resized.mimeType })
		} else {
			resolved.push({ type: "text", text: "[Image omitted: could not be resized below the inline image size limit.]" })
		}
	}
	return resolved
}

async function notebookToolResult(content: Promise<NotebookToolContent>): Promise<NotebookToolRenderResult> {
	return { content: await resolveContentImages(await content), details: undefined }
}

function shortPath(path: string | undefined): string | undefined {
	if (!path) return undefined
	return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path
}

function formatArg(name: string, value: string | number | boolean | undefined): string | undefined {
	if (value === undefined || value === "") return undefined
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
		formatArg("limit", args.lineLimit),
		formatArg("images", args.includeImages),
		formatArg("language", args.language)
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

function renderNotebookTextResult(result: NotebookToolRenderResult, expanded: boolean, theme: NotebookRenderTheme): Text {
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

function renderNotebookDiffResult(result: NotebookToolRenderResult, expanded: boolean, theme: NotebookRenderTheme): Text {
	return result.details?.diff ? new Text(renderDiff(result.details.diff), 0, 0) : renderNotebookTextResult(result, expanded, theme)
}

async function readSelectedCellSource(path: string, args: NotebookSourceMutationArgs): Promise<string> {
	if ((args.cellId === undefined) === (args.index === undefined)) throw new Error("Provide exactly one cell selector: cellId or index")
	const notebook = await loadNotebook(path)
	if (args.cellId !== undefined) return readCellAtIndex(notebook, resolveCellIndex(notebook, { cellId: args.cellId })).source
	if (args.index === undefined) throw new Error("Provide exactly one cell selector: cellId or index")
	const index = resolveCellIndex(notebook, { index: args.index })
	return readCellAtIndex(notebook, index).source
}

type AnyNotebookTool = {
	name: string
	description: string
	mutates: boolean
	params: object
	run: (params: never) => Promise<NotebookToolContent>
}

type NotebookToolEntry = {
	tool: AnyNotebookTool
	label: string
	promptSnippet: string
	readStyleRender?: boolean
	renderResult?: "text" | "diff"
	promptGuidelines?: string[]
}

const notebookTools: NotebookToolEntry[] = [
	{
		tool: notebookSummaryTool,
		label: "Notebook Summary",
		promptSnippet: "Discover existing cells",
		readStyleRender: true,
		renderResult: "text",
		// Shared semantics live once, namespaced on notebook_summary, so deduped
		// system-prompt guidance keeps notebook scope clear.
		promptGuidelines: notebookToolGuidelines
	},
	{
		tool: notebookCreateTool,
		label: "Notebook Create",
		promptSnippet: "Create or overwrite an empty .ipynb notebook."
	},
	{
		tool: notebookReadCellTool,
		label: "Notebook Read Cell",
		promptSnippet: "Read one notebook cell source, optionally by line slice.",
		readStyleRender: true
	},
	{
		tool: notebookWriteCellTool,
		label: "Notebook Write Cell",
		promptSnippet: "Replace one notebook cell source, optionally changing its type.",
		renderResult: "diff"
	},
	{
		tool: notebookChangeCellTypeTool,
		label: "Notebook Change Cell Type",
		promptSnippet: "Change one notebook cell between code, markdown, and raw."
	},
	{
		tool: notebookEditCellTool,
		label: "Notebook Edit Cell",
		promptSnippet: "Edit part of one notebook cell with exact text replacements.",
		renderResult: "diff"
	},
	{
		tool: notebookInsertTool,
		label: "Notebook Insert",
		promptSnippet: "Insert a new code, markdown, or raw cell near an existing anchor."
	},
	{
		tool: notebookDeleteTool,
		label: "Notebook Delete",
		promptSnippet: "Delete one notebook cell."
	},
	{
		tool: notebookMoveTool,
		label: "Notebook Move",
		promptSnippet: "Move one notebook cell before or after another."
	},
	{
		tool: notebookMergeTool,
		label: "Notebook Merge",
		promptSnippet: "Merge one notebook cell with the cell above or below."
	},
	{
		tool: notebookClearOutputsTool,
		label: "Notebook Clear Outputs",
		promptSnippet: "Remove outputs from one code cell."
	},
	{
		tool: notebookReadOutputTool,
		label: "Notebook Read Cell Output",
		promptSnippet: "Read a specific cell output by index. Use notebook_summary first to discover available outputs and their mime types."
	},
	{
		tool: notebookReadCellAttachmentTool,
		label: "Notebook Read Cell Attachment",
		promptSnippet: "Read a cell attachment image. Use notebook_summary first to discover available attachment keys (atts attribute)."
	}
]

export default function notebookExtension(pi: ExtensionAPI) {
	for (const entry of notebookTools) {
		const { tool } = entry
		pi.registerTool({
			name: tool.name,
			label: entry.label,
			description: tool.description,
			promptSnippet: entry.promptSnippet,
			...(entry.promptGuidelines && { promptGuidelines: entry.promptGuidelines }),
			parameters: tool.params,
			renderCall: (args, theme) =>
				entry.readStyleRender
					? renderNotebookReadCall(tool.name, args as NotebookRenderArgs, theme)
					: renderNotebookCall(tool.name, args as NotebookRenderArgs, theme),
			...(entry.renderResult && {
				renderResult: (result: NotebookToolRenderResult, { expanded }: { expanded: boolean }, theme: NotebookRenderTheme) =>
					entry.renderResult === "diff"
						? renderNotebookDiffResult(result, expanded, theme)
						: renderNotebookTextResult(result, expanded, theme)
			}),
			async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
				const path = normalizeNotebookPath((params as { path: string }).path, ctx.cwd)
				const run = async (): Promise<NotebookToolRenderResult> => {
					if (entry.renderResult !== "diff") return notebookToolResult(tool.run({ ...(params as object), path } as never))

					const args = params as NotebookSourceMutationArgs
					const before = await readSelectedCellSource(path, args)
					const after =
						tool === notebookWriteCellTool ? args.source : args.edits === undefined ? undefined : applyExactSourceEdits(before, args.edits)
					if (after === undefined) throw new Error(`Missing source mutation arguments for ${tool.name}`)
					const content = await resolveContentImages(await tool.run({ ...(params as object), path } as never))
					return { content, details: generateDiffString(before, after) }
				}
				return tool.mutates ? withFileMutationQueue(path, run) : run()
			}
		})
	}
}
