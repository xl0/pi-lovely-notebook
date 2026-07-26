# @xl0/pi-lovely-notebook

Jupyter notebook tools for [pi](https://pi.dev). Gives the agent per-cell access to `.ipynb`
files, so it never has to read or rewrite the whole notebook JSON — which is mostly base64
image blobs, and which the model will happily mangle on a full-file write.

```bash
pi install npm:@xl0/pi-lovely-notebook      # user settings
pi install -l npm:@xl0/pi-lovely-notebook   # this project only
pi -e npm:@xl0/pi-lovely-notebook           # try it for one run
```

## Tools

| Tool | Does |
| --- | --- |
| `notebook_summary` | Structure of the whole notebook: cells, ids, outputs, short previews |
| `notebook_create` | New empty notebook |
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

The agent starts from `notebook_summary`, which renders the notebook as pseudo-XML headers with
source and output previews:

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

## In the TUI

- Calls render compactly with the selected cell; summaries and reads collapse with an expand hint.
- `notebook_write_cell` and `notebook_edit_cell` show a source diff of the cell they changed.
- Plot outputs, cell attachments, and markdown `data:` URI images come back as inline images,
  resized through pi's resizer. Undecodable ones become an `[Image omitted: ...]` note.
- All calls for a given notebook are serialized, so pi's parallel tool execution can't interleave
  two writes to the same file.

There is no notebook UI here on purpose — use VSCode (or Jupyter) as the notebook frontend and
let pi edit the file underneath it.

Built on [`@xl0/lovely-notebook`](https://www.npmjs.com/package/@xl0/lovely-notebook).
Source and design notes: https://github.com/xl0/pi-lovely-notebook
