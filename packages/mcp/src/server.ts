#!/usr/bin/env bun
import { isAbsolute, resolve } from "node:path"
import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js"
import {
	type NotebookToolContent,
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
// The version the host reports must track the published one; npm always ships package.json.
import packageJson from "../package.json" with { type: "json" }

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

// One tool call at a time. MCP hosts issue calls concurrently, and every call is a short
// read-parse-write of a single JSON file, so a global chain costs nothing and keeps execution
// order identical to call order. Per-file queueing would only add path-aliasing edge cases.
let queueTail: Promise<void> = Promise.resolve()
export function withQueue<T>(fn: () => Promise<T>): Promise<T> {
	const result = queueTail.then(fn)
	queueTail = result.then(
		() => undefined,
		() => undefined
	)
	return result
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
	{ name: "lovely-notebook", version: packageJson.version },
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

	const rawPath = (args as { path: string }).path
	const params = { ...args, path: isAbsolute(rawPath) ? rawPath : resolve(serverCwd, rawPath) }
	try {
		const run = () => tool.run(params as never)
		const content = capImages(await withQueue(run))
		return { content }
	} catch (error) {
		return { content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }], isError: true }
	}
})

if (import.meta.main) await server.connect(new StdioServerTransport())
