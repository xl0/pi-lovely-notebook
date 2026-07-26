# @xl0/pi-lovely-notebook

Lovely Jupyter notebook tools for [pi](https://pi.dev). Gives the agent per-cell access to `.ipynb` files.

```bash
pi install npm:@xl0/pi-lovely-notebook      # user settings
pi -e npm:@xl0/pi-lovely-notebook           # try it for one run
```

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
| `notebook_read_cell_attachment` | One image pasted into a markdown cell, by its `attachment:` key |

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


## In the TUI

- Calls render compactly with the selected cell; summaries and reads collapse with an expand hint.
- `notebook_write_cell` and `notebook_edit_cell` show a source diff of the cell they changed.
- Plot outputs, cell attachments, and markdown `data:` URI images come back as inline images,
  resized through pi's resizer. Undecodable ones become an `[Image omitted: ...]` note.
- All calls for a given notebook are serialized, so pi's parallel tool execution can't interleave
  two writes to the same file.


Built on [`@xl0/lovely-notebook`](https://www.npmjs.com/package/@xl0/lovely-notebook).
Source and design notes: https://github.com/xl0/pi-lovely-notebook

## Related projects

|  |  |
| --- | --- |
| [Pi Lovely Web](https://github.com/xl0/pi-lovely-web) | `web_search`, `web_fetch`, `web_image` tools |
| [Pi Lovely Dev Tools](https://github.com/xl0/pi-lovely-dev-tools) | interactive debugging helpers `/tool`, `/show-sysprompt`, `/show-context`, `/llm-stats` |
| [Pi Lovely Codex](https://github.com/xl0/pi-lovely-codex) | GPT fast mode and Codex-style `apply_patch` |
| [Pi Lovely IDE](https://github.com/xl0/pi-lovely-ide) | IDE integration |
| [Pi Lovely Config](https://github.com/xl0/pi-lovely-config) | scoped config helpers for Pi extensions |
| [Pi Lovely Comment](https://github.com/xl0/agent-files/tree/master/pi/packages/pi-lovely-comment) | open the last assistant message in your editor and sync edits back into the prompt |
| [Pi Lovely Rename](https://github.com/xl0/agent-files/tree/master/pi/packages/pi-lovely-rename) | automatic and manual session naming |

---

Like this work? [Hire me](https://alexey.work/cv?ref=pi-lovely-notebook)
