# Department Module

## Purpose

Manages the organisational unit structure. Departments group employees and positions. They are a reference entity used by Employees, Positions, and the Dashboard.

## Module Path

`apps/api/src/departments/`

## Endpoints

| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | /departments | ✅ | Any | Paginated department list |
| GET | /departments/:id | ✅ | Any | Single department by UUID |
| POST | /departments | ✅ | SUPER_ADMIN, HR_ADMIN | Create department |
| PATCH | /departments/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Update department name/description |
| DELETE | /departments/:id | ✅ | SUPER_ADMIN, HR_ADMIN | Hard delete (safe — blocked if in use) |

## Query Parameters (GET /departments)

`page` · `limit` · `search`

## Business Rules

- **Safe hard delete**: `DELETE /departments/:id` is blocked (409) if any employees or positions still reference the department. The department must be empty before deletion.
- **Department name is unique**: duplicate returns 409
- **Read access to all roles**: all authenticated users can view departments (org directory by design)

## Manager Assignment (v1.2.0)

Departments support a designated manager via `Department.managerId`. The field was in the schema from v1.0; the web UI and API response exposure were added in v1.2.0.

- Web `/departments` page shows a manager column
- Department form includes a manager dropdown (assign or clear)
- `GET /departments` and `GET /departments/:id` responses include `managerId` and `manager` fields
- `PATCH /departments/:id` accepts `managerId` to assign a manager

The designated manager gains department-scoped leave and off-site request approve/reject authority. See [[ADR-023 Department Manager Leave Approval Scope]] and [[RBAC Rules]].

## Test Coverage (STEP-16B)

- `apps/api/src/departments/departments.service.spec.ts` and `departments.controller.spec.ts` — CRUD, pagination/search, safe-delete conflict paths, name-uniqueness conflicts, manager assignment/reassignment, and RBAC metadata assertions (create/update/remove restricted to `SUPER_ADMIN`/`HR_ADMIN`; findAll/findOne unrestricted).
- `apps/web/e2e/departments.spec.ts` — page load, list/empty state, admin-only Add button, search, row actions, and the manager-field i18n fix below.

## i18n Fix (STEP-16B)

The admin `/departments` page originally had three UI strings hardcoded in Thai regardless of the selected language: the manager table column header, the manager field label, and the "no manager" option placeholder in the create/edit modal. These now use `t('dept_col_manager')`, `t('dept_field_manager')`, and `t('dept_manager_none')` from `apps/web/lib/i18n.ts` (both `en` and `th` dictionaries), matching the rest of the page.

## Total Count / Date Polish (DEPT-POLISH-001)

Two remaining optional polish items from STEP-16A/16B were closed:

- The header's total-count text (`"8 total"`) was a raw hardcoded English JSX literal. Now routed through the existing (previously unused) `total_label` i18n key: `t('total_label').replace('{total}', meta.total.toLocaleString())`, giving `"8 total"` in English and `"ทั้งหมด 8 รายการ"` in Thai.
- The `Created` column used the browser's locale-less `toLocaleDateString()` (always numeric `M/D/YYYY`). Now uses a local `formatDate(iso, lang)` helper matching the pattern already used by `attendance/offsite-review` and `attendance/risk-reviews`: `toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })`. Thai mode renders the Buddhist-era year (e.g. `11 ก.ค. 2569`).

No backend/schema/RBAC change. See [docs/CTO_SUMMARY_DEPT_POLISH_001.md](../../../docs/CTO_SUMMARY_DEPT_POLISH_001.md).

## Known Limitations

- No parent/child department hierarchy — flat structure only
- No active/inactive (archive) flag — a department can only be hard-deleted, and deletion is blocked while any employee or position still references it
- Pagination text ("Page X of Y") on the admin list page is still hardcoded English — not yet routed through i18n (out of scope for DEPT-POLISH-001)

## Related ADRs

- [[ADR-006 RBAC]]
- [[ADR-007 API Standards]]

## Related Notes

- [[Employee Module]]
- [[Position Module]]
- [[API Route Index]]

#domain #department #backend-v1
