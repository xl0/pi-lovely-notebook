import { expect, test } from "bun:test"
import { withQueue } from "../src/server"

test("withQueue runs calls one at a time, in call order", async () => {
	const order: string[] = []
	let releaseFirst: () => void = () => undefined
	const firstGate = new Promise<void>(resolve => {
		releaseFirst = resolve
	})

	const first = withQueue(async () => {
		order.push("first-start")
		await firstGate
		order.push("first-end")
	})
	const second = withQueue(async () => {
		order.push("second")
	})

	await Bun.sleep(10)
	expect(order).toEqual(["first-start"])

	releaseFirst()
	await Promise.all([first, second])
	expect(order).toEqual(["first-start", "first-end", "second"])
})

test("withQueue keeps running after a failed call", async () => {
	const failed = withQueue(async () => {
		throw new Error("boom")
	})
	await expect(failed).rejects.toThrow("boom")
	expect(await withQueue(async () => "ok")).toBe("ok")
})
