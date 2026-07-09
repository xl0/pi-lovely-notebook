# Dual cellId + index selectors

Cell tools accept either a `cellId` or an `index` selector, never both. `cellId` provides stable addressing across insertions and deletions — the LLM can hold onto an id it saw in a summary. `index` works on older notebooks that lack stored cell ids, and is the natural selector for positional operations (move/insert relative to another cell).

Indexes exposed by notebook tools are 0-based, matching summary output and the internal notebook model. Negative indexes are invalid except `notebook_insert` accepts `index: -1` as append-at-end. `notebook_move.targetIndex` must name an existing anchor cell; it does not use `-1`.

Ids are not auto-assigned on read or mutation: older no-id notebooks stay index-addressed. Inserted cells get ids only when the notebook already uses ids or declares nbformat 4.5+ (`nbformat_minor >= 5`), where the spec requires ids. Existing cells with missing ids are not backfilled; mutations preserve that pre-existing shape instead of silently rewriting addressing.
