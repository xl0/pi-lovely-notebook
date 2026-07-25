import { expect, test } from "bun:test"
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { withFileQueue } from "../src/server"

test("withFileQueue serializes real-path and symlink aliases", async () => {
	const dir = await mkdtemp(join(tmpdir(), "notebook-mcp-queue-"))
	const path = join(dir, "demo.ipynb")
	const alias = join(dir, "alias.ipynb")
	await writeFile(path, "{}")
	await symlink(path, alias)

	let releaseFirst: () => void = () => undefined
	let markFirstStarted: () => void = () => undefined
	const firstGate = new Promise<void>(resolve => {
		releaseFirst = resolve
	})
	const firstStarted = new Promise<void>(resolve => {
		markFirstStarted = resolve
	})
	let markSecondStarted: () => void = () => undefined
	const secondStarted = new Promise<void>(resolve => {
		markSecondStarted = resolve
	})

	try {
		const first = withFileQueue(path, async () => {
			markFirstStarted()
			await firstGate
		})
		await firstStarted

		const second = withFileQueue(alias, async () => {
			markSecondStarted()
		})
		expect(await Promise.race([secondStarted.then(() => "started"), Bun.sleep(20).then(() => "blocked")])).toBe("blocked")

		releaseFirst()
		await Promise.all([first, second])
	} finally {
		await rm(dir, { recursive: true, force: true })
	}
})
