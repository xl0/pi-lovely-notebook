import { expect, test } from "bun:test"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { type ExtensionAPI, initTheme } from "@earendil-works/pi-coding-agent"
import { loadNotebook } from "@xl0/lovely-notebooks"
import notebookExtension from "../extensions/notebook"

initTheme()

type DiffTool = {
	name: string
	execute: (
		toolCallId: string,
		params: object,
		signal: undefined,
		onUpdate: undefined,
		ctx: { cwd: string }
	) => Promise<{ details: { diff: string } | undefined }>
	renderResult?: (
		result: { content: Array<{ type: "text"; text: string }>; details: { diff: string } },
		options: { expanded: boolean },
		theme: object
	) => { render: (width: number) => string[] }
}

function registeredTool(name: string): DiffTool {
	const tools: DiffTool[] = []
	notebookExtension({ registerTool: (tool: DiffTool) => tools.push(tool) } as unknown as ExtensionAPI)
	const tool = tools.find(candidate => candidate.name === name)
	if (tool === undefined) throw new Error(`Tool not registered: ${name}`)
	return tool
}

async function tempNotebook(source: string) {
	const dir = await mkdtemp(join(tmpdir(), "notebook-pi-diff-"))
	const path = join(dir, "demo.ipynb")
	await writeFile(
		path,
		JSON.stringify({
			nbformat: 4,
			nbformat_minor: 5,
			metadata: {},
			cells: [{ cell_type: "markdown", id: "intro", metadata: {}, source }]
		})
	)
	return { dir, path }
}

test("notebook_write_cell returns and renders a cell-source diff", async () => {
	const notebook = await tempNotebook("one\ntwo\n")
	try {
		const tool = registeredTool("notebook_write_cell")
		const result = await tool.execute("call", { path: notebook.path, cellId: "intro", source: "one\nthree\n" }, undefined, undefined, {
			cwd: notebook.dir
		})
		expect(result.details?.diff).toContain("-2 two")
		expect(result.details?.diff).toContain("+2 three")
		expect((await loadNotebook(notebook.path)).cells[0]?.source).toBe("one\nthree\n")

		if (result.details === undefined || tool.renderResult === undefined) throw new Error("Missing diff renderer")
		const rendered = tool.renderResult({ content: [{ type: "text", text: "done" }], details: result.details }, { expanded: false }, {})
		expect(rendered.render(120).join("\n")).toContain("three")
	} finally {
		await rm(notebook.dir, { recursive: true, force: true })
	}
})

test("notebook_edit_cell returns a cell-source diff", async () => {
	const notebook = await tempNotebook("alpha beta\n")
	try {
		const result = await registeredTool("notebook_edit_cell").execute(
			"call",
			{ path: notebook.path, cellId: "intro", edits: [{ oldText: "beta", newText: "gamma" }] },
			undefined,
			undefined,
			{ cwd: notebook.dir }
		)
		expect(result.details?.diff).toContain("-1 alpha beta")
		expect(result.details?.diff).toContain("+1 alpha gamma")
		expect((await loadNotebook(notebook.path)).cells[0]?.source).toBe("alpha gamma\n")
	} finally {
		await rm(notebook.dir, { recursive: true, force: true })
	}
})
