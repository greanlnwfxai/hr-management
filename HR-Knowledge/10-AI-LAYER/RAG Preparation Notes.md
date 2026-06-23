# RAG Preparation Notes

## How This Vault Becomes a RAG Source

This Obsidian vault is designed so that each markdown file can be converted into a RAG document with minimal transformation.

## Chunking Strategy

### Recommended: One File = One Chunk (Primary)

Each file in HR-Knowledge is a self-contained topic. Start with file-level chunking:

| File | Topic | Approx. Tokens |
|---|---|---|
| `07-BUSINESS-RULES/Attendance Rules.md` | LATE evaluation, Bangkok timezone | ~800 |
| `07-BUSINESS-RULES/Leave Rules.md` | Leave lifecycle, approval rules, balance | ~900 |
| `07-BUSINESS-RULES/RBAC Rules.md` | Four-role matrix, ownership checks | ~700 |
| `04-DOMAINS/*/` | Per-module endpoints, rules, limitations | ~400–700 each |
| `03-ADR/*/` | Architecture decisions with rationale | ~300–600 each |
| `05-API/API Route Index.md` | Current API inventory | ~1000 |

### Secondary: Section-Level Chunking

For files over 1,000 tokens, split by `##` heading. Each section becomes a sub-chunk retaining the parent file title in metadata.

## Metadata Schema

Tag each chunk with:

```json
{
  "source": "HR-Knowledge/07-BUSINESS-RULES/Leave Rules.md",
  "title": "Leave Rules",
  "section": "Approval Rules",
  "module": "leave",
  "domain": "business-rules",
  "tags": ["leave", "business-rules", "rag-ready"],
  "type": "business-rule",
  "version": "v1.1.31",
  "last_updated": "2026-06-20"
}
```

### Suggested Metadata Fields

| Field | Values | Purpose |
|---|---|---|
| `module` | auth, employee, department, position, attendance, leave, leave-balance, dashboard, off-site | Filter by module |
| `domain` | business-rules, api, architecture, adr, database, sop, qa | Filter by topic type |
| `endpoint` | `/leave/:id/approve`, etc. | Exact endpoint lookup |
| `role` | SUPER_ADMIN, HR_ADMIN, MANAGER, EMPLOYEE | Role-scoped retrieval |
| `business_rule` | late-rule, balance-deduction, overlap-check, etc. | Rule-specific queries |
| `adr_number` | ADR-001 through ADR-024 | ADR lookup |
| `type` | business-rule, api-route, architecture, sop, qa | Coarse type filter |

## Retrieval Strategy

### Hybrid Search (Recommended)

Combine:
1. **Semantic similarity** — embed user query, find nearest chunks by cosine distance
2. **Metadata filter** — pre-filter by `module`, `role`, or `type` based on query intent

Example: Query "How do I approve a leave request?" →
- Semantic: finds `Leave Rules.md`, `Leave Request Module.md`
- Filter: `module=leave`, `type=business-rule`

### Re-ranking

After retrieval, re-rank by:
1. Exact keyword match (e.g., "approve" in chunk title/heading)
2. Recency (`last_updated`)
3. Role relevance (user's role matches chunk's role metadata)

## Embedding Model Recommendations

- **OpenAI** `text-embedding-3-small` — cost-effective, good for English HR content
- **Anthropic Claude** with retrieval — use Claude's native context window for small vaults
- **Local** `all-MiniLM-L6-v2` — if data privacy requires on-premise embedding

## Vector Database Options

| Option | Notes |
|---|---|
| `pgvector` | Add to existing PostgreSQL — zero new infrastructure |
| Pinecone | Managed, fast semantic search |
| Weaviate | Open-source, rich metadata filtering |
| Chroma | Simple, local development |

`pgvector` is the recommended starting point — it runs in the existing PostgreSQL container.

## Sync Strategy

When the vault is updated (new ADR, new module, updated rules):

1. Re-embed only the changed files (track `last_updated` metadata)
2. Update the vector store incrementally (upsert by file path)
3. Run a brief smoke query after sync to confirm retrieval still works

## Future Sync Automation

A simple CI step after each commit could:

```bash
# Pseudocode
for file in HR-Knowledge/**/*.md:
  if file.changed_since_last_sync:
    chunk = split_by_h2(file)
    embedding = embed(chunk)
    vector_store.upsert(id=file.path, embedding=embedding, metadata=chunk.metadata)
```

## Role-Scoped Retrieval

When the AI assistant serves a specific user role, apply a pre-filter:

- `EMPLOYEE` → only retrieve chunks tagged with `role: EMPLOYEE` or `role: any`
- `MANAGER` → add `role: MANAGER` chunks
- `HR_ADMIN` / `SUPER_ADMIN` → no role filter (full access)

This prevents the AI from surfacing admin-only information to employee-facing responses.

## Related Notes

- [[Future AI HR Assistant]]
- [[API Route Index]]
- [[RBAC Rules]]

#rag-ready #ai-layer #future
