# @xl0/lovely-notebook-mcp

Local stdio MCP server exposing Jupyter notebook tools. Gives an MCP host per-cell access to
`.ipynb` files, so the model never has to read or rewrite the whole notebook JSON — which is
mostly base64 image blobs, and which it will happily mangle on a full-file write.

Requires [bun](https://bun.sh); the package ships TypeScript source and runs unbuilt.

Claude Code:

```bash
claude mcp add lovely-notebook -- bunx @xl0/lovely-notebook-mcp
```

Any other host, via config:

```json
{
  "mcpServers": {
    "lovely-notebook": {
      "command": "bunx",
      "args": ["@xl0/lovely-notebook-mcp"]
    }
  }
}
```

Relative notebook paths resolve against the server process's working directory, which the host
sets when it spawns the server. Absolute paths always work.

## Tools

| Tool | Does |
| --- | --- |
| `notebook_summary` | Structure of the whole notebook: cells, ids, outputs, short previews |
| `notebook_create` | New empty notebook (refuses to overwrite) |
| `notebook_read_cell` | One cell's source, optionally line-sliced |
| `notebook_write_cell` | Replace one cell's source, optionally change its type |
| `notebook_edit_cell` | Exact string replacements inside one cell |
| `notebook_change_cell_type` | code / markdown / raw |
| `notebook_insert` | Insert a cell before or after an anchor (`index: -1` appends) |
| `notebook_delete` | Delete a cell |
| `notebook_move` | Move a cell relative to another |
| `notebook_merge` | Merge with the adjacent same-type cell |
| `notebook_clear_outputs` | Drop outputs, keep source and execution count |
| `notebook_read_cell_output` | One output, as text or image (index optional for single-output cells) |
| `notebook_read_cell_attachment` | One cell attachment, by key |

nbformat 4 only. Each tool acts on one cell, selected by `cellId` or 0-based `index`.
Mutations preserve ids, metadata, and outputs; notebooks without cell ids stay that way and are
addressed by index.

Start with `notebook_summary`, which renders the notebook as pseudo-XML headers with source and
output previews:

```txt
<meta nbformat=4.5 kernel=python3 cells=12 />
<cell index="0" id="20735603" type="md" lines="1">
# 📜 IPython's history obsession
</cell>
<cell index="3" id="ffd208cf" type="code" lines="2" outputs="1">
# |eval: false
torch.cuda.memory_allocated()
<output index="0" type="execute_result" mime="text/plain">
0
</output>
</cell>
```

Outputs nest inside their cell and previews sit inside the element that owns them, so output
text that looks like markup — `<lovely_tensors.repr_rgb.RGBProxy>`, the usual Python repr —
can't be confused with structure.

Plot outputs, cell attachments, and markdown `data:` URI images are returned as image content.
The server has no resizer, so images over 4MB base64 become an omission note instead — read them
in the notebook UI.

Tool calls are serialized — one at a time, in the order the host issued them — because hosts
issue calls concurrently and every call is a read-parse-write of a whole notebook file. Note this
only orders *this server's* calls: if the host also edits the notebook with its own file tools,
nothing coordinates the two.

Built on [`@xl0/lovely-notebook`](https://www.npmjs.com/package/@xl0/lovely-notebook).
Source and design notes: https://github.com/xl0/pi-lovely-notebook
