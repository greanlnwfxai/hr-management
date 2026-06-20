# Future AI HR Assistant

## Purpose

This note describes the vision and design considerations for an AI assistant that helps HR administrators and employees operate the HR Management System.

The HR-Knowledge vault is designed to serve as the **knowledge foundation** for this AI assistant.

## Use Cases

### HR Administrator Use Cases

| Use Case | Example Query |
|---|---|
| Employee lookup | "How many active employees are in the Engineering department?" |
| Leave management | "Show me all pending leave requests for this week." |
| Attendance review | "Which employees were late more than 3 times this month?" |
| Dashboard summary | "Give me a summary of today's HR status." |
| Policy explanation | "What is the leave balance policy for sick leave?" |
| System guidance | "How do I approve a leave request?" |

### Employee Self-Service Use Cases

| Use Case | Example Query |
|---|---|
| Leave status | "How many vacation days do I have left?" |
| Attendance check | "Did I clock in on time yesterday?" |
| Policy questions | "What time do I need to clock in to be considered on time?" |
| Leave submission | "How do I submit a leave request?" |

### Manager Use Cases

| Use Case | Example Query |
|---|---|
| Team overview | "Show me the dashboard summary." |
| Leave decisions | "Which leave requests are pending approval?" |
| Balance monitoring | "Which employees have low leave balances?" |

## RAG-Ready Knowledge Structure

This vault is structured for RAG (Retrieval-Augmented Generation):

- Each domain note covers one module with clear headings
- Business rules are isolated in `07-BUSINESS-RULES/`
- API routes are catalogued in [[API Route Index]]
- ADRs explain *why* decisions were made — useful context for the AI

See [[RAG Preparation Notes]] for the full RAG strategy.

## Design Principles for the AI Layer

### 1. Role-Aware Responses

The AI assistant should be aware of the user's role:

- `EMPLOYEE` — only surfaces their own data; never exposes other employees' data
- `MANAGER` — can summarise team data but not approve or modify
- `HR_ADMIN` — can guide through administrative actions
- `SUPER_ADMIN` — full access to all information

### 2. Privacy and Security

- **Do not expose passwords or secrets** — JWT secrets, database credentials, or any sensitive configuration must never appear in AI responses
- **Respect employee privacy** — individual employee data should only be surfaced to users with appropriate roles
- **Do not generate or guess URLs** — only reference documented API endpoints
- **Never fabricate data** — AI must acknowledge when it does not have enough context

### 3. Knowledge Currency

The AI assistant's knowledge should now align with the current `v1.1.31` product state. It should:

- Acknowledge known limitations (for example, audit log work is specification-only and not yet implemented)
- Refer users to HR staff for actions it cannot perform
- Indicate when a feature is planned but not yet implemented

Examples of current-state knowledge it should know:
- login supports username or email
- web and mobile profile/password change flows exist
- `mustChangePassword` is enforced in current web/mobile UX
- mobile app includes Home, Attendance, Leave, Calendar, Profile, and Approvals flows
- work schedule is `08:30–17:30` and late threshold is strictly after `08:30` Bangkok time
- audit log is still spec-only via `docs/T057_AUDIT_LOG_FOUNDATION_SPEC.md`

### 4. Scope Boundaries

The AI assistant in v1.0 scope is **advisory only** — it explains, summarises, and guides but does **not** directly execute API calls or modify data.

Future versions may integrate with the API to provide agentic capabilities (e.g., "submit a leave request on my behalf"), but this requires additional security review and role-scoped access tokens.

## Implementation Notes (Future)

When implementing the AI assistant:

1. **Embed this vault** into a vector database (e.g., Pinecone, Weaviate, pgvector)
2. **Chunk by file** — each markdown file in HR-Knowledge is one document
3. **Tag with metadata** — see [[RAG Preparation Notes]] for metadata schema
4. **Retrieval** — use semantic search to find relevant notes, then pass to an LLM with the HR context window
5. **Role filter** — apply the user's role as a pre-retrieval filter so the AI only accesses appropriate content
6. **Fallback** — if the AI cannot answer, route to a human HR staff member

## Related Notes

- [[RAG Preparation Notes]]
- [[RBAC Rules]]
- [[API Route Index]]
- [[Leave Rules]]
- [[Attendance Rules]]

#ai-layer #rag-ready #future
