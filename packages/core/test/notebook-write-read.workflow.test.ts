import { expect, test } from "bun:test"
import { notebookReadCellTool, notebookWriteCellTool } from "../src/tools"
import { copyFixture, firstText } from "./helpers"

test("code write then read preserves exact source", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const source = '# |eval: false\nt = torch.tensor(42, device="cuda")\nt\n'
		await notebookWriteCellTool.run({ path: fixture.path, cellId: "95cca932", source })
		const result = await notebookReadCellTool.run({ path: fixture.path, cellId: "95cca932" })
		expect(firstText(result)).toBe(source)
	} finally {
		await fixture.cleanup()
	}
})

test("markdown write then read preserves exact source", async () => {
	const fixture = await copyFixture("lovely-history.ipynb")

	try {
		const source = "line 1\\\nline 2\n\n> quote\n"
		await notebookWriteCellTool.run({ path: fixture.path, cellId: "9fd3e324", source })
		const result = await notebookReadCellTool.run({ path: fixture.path, cellId: "9fd3e324" })
		expect(firstText(result)).toBe(source)
	} finally {
		await fixture.cleanup()
	}
})
