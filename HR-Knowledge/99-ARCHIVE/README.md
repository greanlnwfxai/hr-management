# Archive

This folder holds notes that are no longer current but are preserved for historical reference.

## When to Archive

Move a note here when:
- A decision has been superseded by a newer ADR
- A module was removed or significantly redesigned
- A business rule changed and the old version needs to be preserved
- A SOP was replaced by an updated workflow

## How to Archive

1. Move the file from its original folder into `99-ARCHIVE/`
2. Add a header to the archived file:
   ```
   > **ARCHIVED** — Superseded by [[New Note Name]] on YYYY-MM-DD
   ```
3. Update any notes that linked to the archived file to point to the replacement
4. Update `MEMORY.md` or the [[ADR Index]] if an ADR was archived

## What Not to Archive

- ADR files — ADRs are immutable records of past decisions. Even if a decision was later reversed, the original ADR should stay in place with a `Superseded` status note, not be moved to archive.
- Notes that are simply outdated — update them in place instead of archiving

## Current Archive

_(Empty — no notes have been archived yet.)_

#archive
