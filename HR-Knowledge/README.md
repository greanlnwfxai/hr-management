# HR Management — Knowledge Base

This vault is the official knowledge base for the **HR Management System** project.

## Purpose

| Goal | Description |
|---|---|
| Obsidian Second Brain | Structured, interlinked notes for the development team |
| Future RAG Knowledge Base | Chunked, tagged documents ready for embedding + retrieval |
| Future AI HR Assistant | Domain knowledge foundation for an AI that helps HR staff operate the system |

## Navigation

| Section | Content |
|---|---|
| [[Project Overview]] | Stack, ports, strategy, status |
| [[Current Status]] | What is done, what is next, known limitations |
| [[System Architecture]] | High-level architecture diagram + component roles |
| [[Backend v1 Architecture]] | Module map, design patterns, API contract stability |
| [[ADR Index]] | All 12 Architecture Decision Records with summaries |
| [[API Route Index]] | All 30 endpoints grouped by module |
| [[Database Overview]] | PostgreSQL + Prisma schema overview |
| [[Auth Module]] | Authentication — JWT login, guards, decorators |
| [[Employee Module]] | Employee CRUD, soft delete, org directory |
| [[Department Module]] | Department management |
| [[Position Module]] | Position management |
| [[Attendance Module]] | Clock-in/out, LATE rule, Bangkok timezone |
| [[Leave Request Module]] | Leave lifecycle, approval, overlap validation |
| [[Leave Balance Module]] | Quota tracking, balance deduction |
| [[Dashboard Module]] | Aggregated HR summary, 19 parallel queries |
| [[Attendance Rules]] | Bangkok timezone LATE evaluation rules |
| [[Leave Rules]] | Leave lifecycle and balance rules |
| [[RBAC Rules]] | Four-role access control matrix |
| [[Development Workflow]] | Claude Code + User + ChatGPT responsibilities |
| [[Verification Workflow]] | Three-script verification gate |
| [[Backend QA Checklist]] | 12-section QA checklist |
| [[Backend v1 Readiness]] | Formal v1.0 readiness report |
| [[Future AI HR Assistant]] | Future AI assistant use cases and safety notes |
| [[RAG Preparation Notes]] | How to convert this vault into a RAG source |

## Vault Structure

```
HR-Knowledge/
├── 00-INBOX/             ← Unsorted new notes go here
├── 01-START-HERE/        ← Project overview and current status
├── 02-ARCHITECTURE/      ← System and backend architecture
├── 03-ADR/               ← Architecture Decision Records index + summaries
├── 04-DOMAINS/           ← Per-module domain notes (Auth, Employee, Leave, etc.)
├── 05-API/               ← API route inventory
├── 06-DATABASE/          ← Database schema and migration policy
├── 07-BUSINESS-RULES/    ← Attendance rules, leave rules, RBAC
├── 08-SOP/               ← Development and verification workflows
├── 09-QA/                ← QA checklist and readiness report
├── 10-AI-LAYER/          ← Future AI assistant + RAG preparation
└── 99-ARCHIVE/           ← Superseded notes
```

## How to Use This Vault

- Open the `HR-Knowledge/` folder as an **Obsidian vault**.
- Start reading from [[Project Overview]] or [[Current Status]].
- Use Obsidian's graph view to explore connections between modules and ADRs.
- Tags like `#backend-v1`, `#business-rules`, and `#rag-ready` help filter notes.

#hr-management #obsidian-vault #rag-ready
