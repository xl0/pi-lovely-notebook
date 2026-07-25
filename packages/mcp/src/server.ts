#!/usr/bin/env bun
import { realpath } from "node:fs/promises"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import {
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
	notebookWriteCellTool
} from "@xl0/lovely-notebook"
import { Value } from "typebox/value"

const notebookTools = [
	notebookSummaryTool,
	notebookCreateTool,
	notebookReadCellTool,
	notebookWriteCellTool,
	notebookChangeCellTypeTool,
	notebookEditCellTool,
	notebookInsertTool,
	notebookDeleteTool,
	notebookMoveTool,
	notebookMergeTool,
	notebookClearOutputsTool,
	notebookReadOutputTool,
	notebookReadCellAttachmentTool
] as const

type NotebookTool = (typeof notebookTools)[number]
const toolsByName = new Map<string, NotebookTool>(notebookTools.map(tool => [tool.name, tool]))

// Serialize all access per notebook file; MCP hosts may issue tool calls concurrently.
const fileQueues = new Map<string, Promise<void>>()
export async function withFileQueue<T>(path: string, fn: () => Promise<T>): Promise<T> {
	let key: string
	try {
		key = await realpath(path)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
		key = path
	}

	const prev = fileQueues.get(key) ?? Promise.resolve()
	const next = prev.then(fn)
	const tail = next.then(
		() => undefined,
		() => undefined
	)
	fileQueues.set(key, tail)
	void tail.then(() => {
		if (fileQueues.get(key) === tail) fileQueues.delete(key)
	})
	return next
}

// No image resizer in the MCP build; cap raw size instead (Claude inline image limit is ~5MB decoded).
const MAX_IMAGE_BASE64_LENGTH = 4 * 1024 * 1024
function capImages(content: NotebookToolContent): NotebookToolContent {
	return content.map(item => {
		if (item.type !== "image" || item.data.length <= MAX_IMAGE_BASE64_LENGTH) return item
		const sizeKb = Math.round((item.data.length * 3) / 4 / 1024)
		return { type: "text", text: `[Image omitted: ${sizeKb}KB ${item.mimeType} exceeds the inline image size limit.]` }
	})
}

const server = new Server(
	{ name: "lovely-notebook", version: "0.1.0" },
	{
		capabilities: { tools: {} },
		instructions: notebookToolGuidelines.join("\n")
	}
)
const serverCwd = process.cwd()

server.setRequestHandler(ListToolsRequestSchema, () => ({
	tools: notebookTools.map(tool => ({
		name: tool.name,
		description: tool.description,
		inputSchema: tool.params as { type: "object" }
	}))
}))

server.setRequestHandler(CallToolRequestSchema, async request => {
	const tool = toolsByName.get(request.params.name)
	if (!tool) throw new Error(`Unknown tool: ${request.params.name}`)

	const args = request.params.arguments ?? {}
	if (!Value.Check(tool.params, args)) {
		const errors = [...Value.Errors(tool.params, args)].map(error => `${error.instancePath || "/"}: ${error.message}`)
		return { content: [{ type: "text", text: `Invalid arguments:\n${errors.join("\n")}` }], isError: true }
	}

	const params = { ...args, path: normalizeNotebookPath((args as { path: string }).path, serverCwd) }
	try {
		const run = () => tool.run(params as never)
		const content = capImages(await withFileQueue(params.path, run))
		return { content }
	} catch (error) {
		return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true }
	}
})

if (import.meta.main) await server.connect(new StdioServerTransport())
