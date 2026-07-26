#!/usr/bin/env node
/** Published entry point. Kept apart from server.ts so importing the server does not connect it. */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { server } from "./server"

await server.connect(new StdioServerTransport())
