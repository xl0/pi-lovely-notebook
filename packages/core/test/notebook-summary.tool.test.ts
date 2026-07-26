import { expect, test } from "bun:test"
import { join } from "node:path"
import { notebookSummaryTool } from "../src/tools"
import { copyFixture, FIXTURE_DIR, firstText } from "./helpers"

test("runNotebookSummary reports cleared outputs", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const summary = await notebookSummaryTool.run({ path: fixture.path })
		expect(firstText(summary)).toContain("meta nbformat=4.5 kernel=python3 cells=12")
		expect(firstText(summary)).toContain('<cell index="4" id="95cca932" type="code" lines="3" outputs="1">')
		expect(firstText(summary)).toContain('<output index="0" type="execute_result" mime="text/plain">')
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookSummary works on fixture path", async () => {
	const result = await notebookSummaryTool.run({ path: join(FIXTURE_DIR, "lovely-history.ipynb") })
	expect(firstText(result)).toContain('<cell index="0" id="20735603" type="md"')
	expect(firstText(result)).toContain('<output index="0" type="stream" name="stdout">')
})

test("runNotebookSummary supports line slices", async () => {
	const result = await notebookSummaryTool.run({
		path: join(FIXTURE_DIR, "lovely-history.ipynb"),
		lineOffset: 1,
		lineLimit: 1
	})
	expect(firstText(result)?.startsWith('<cell index="0" id="20735603" type="md"')).toBe(true)
	expect(firstText(result)).toContain("Use offset=2 to continue.")
})
