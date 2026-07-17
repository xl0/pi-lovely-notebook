# Preserve cell outputs on mutation

Source-only write and edit operations preserve existing cell outputs. Outputs are removed by the explicit `clear_outputs` tool or when changing a code cell to markdown/raw, where outputs are invalid for the target cell type. This matches Jupyter and VSCode behavior: editing a cell's source does not implicitly clear its output, even though the output may now be stale.
