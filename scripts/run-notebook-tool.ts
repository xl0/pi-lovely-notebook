import {
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
	notebookWriteCellTool
} from "@xl0/lovely-notebooks"

const runners = {
	notebook_summary: notebookSummaryTool.run,
	notebook_create: notebookCreateTool.run,
	notebook_read_cell: notebookReadCellTool.run,
	notebook_write_cell: notebookWriteCellTool.run,
	notebook_change_cell_type: notebookChangeCellTypeTool.run,
	notebook_edit_cell: notebookEditCellTool.run,
	notebook_insert: notebookInsertTool.run,
	notebook_delete: notebookDeleteTool.run,
	notebook_move: notebookMoveTool.run,
	notebook_merge: notebookMergeTool.run,
	notebook_clear_outputs: notebookClearOutputsTool.run,
	notebook_read_cell_output: notebookReadOutputTool.run,
	notebook_read_cell_attachment: notebookReadCellAttachmentTool.run
} as const

const [toolName, jsonArgs] = process.argv.slice(2)

if (!toolName || !jsonArgs) {
	console.error("Usage: bun scripts/run-notebook-tool.ts <tool-name> '<json-args>'")
	process.exit(1)
}

if (!(toolName in runners)) {
	console.error(`Unknown tool: ${toolName}`)
	process.exit(1)
}

const args = JSON.parse(jsonArgs) as object
const content = await runners[toolName as keyof typeof runners](args as never)
for (const part of content) {
	if (part.type === "text") {
		process.stdout.write(`${part.text}\n`)
	} else if (part.type === "image") {
		console.log(`[image: ${part.mimeType}, ${part.data.length} bytes]`)
	}
}
