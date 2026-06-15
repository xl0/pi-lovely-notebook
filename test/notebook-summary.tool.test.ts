import { expect, test } from "bun:test"
import { join } from "node:path"
import { runNotebookSummary } from "../extensions/notebook/tools"
import { copyFixture, FIXTURE_DIR } from "./helpers"

test("runNotebookSummary reports cleared outputs", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const summary = await runNotebookSummary({ path: fixture.path })
		expect(summary.content[0]?.text).toContain("meta nbformat=4.5 kernel=python3 cells=12")
		expect(summary.content[0]?.text).toContain('<cell index="5" id="95cca932" type="code" lines="3" outputs="1" />')
		expect(summary.content[0]?.text).toContain('<output cell_id="95cca932" index="1" type="execute_result" mime="text/plain" />')
	} finally {
		await fixture.cleanup()
	}
})

test("runNotebookSummary works on fixture path", async () => {
	const result = await runNotebookSummary({ path: join(FIXTURE_DIR, "lovely-history.ipynb") })
	expect(result.content[0]?.text).toContain('<cell index="1" id="20735603" type="md"')
	expect(result.content[0]?.text).toContain('<output cell_id="4ea6855e" index="1" type="stream" name="stdout" />')
})
