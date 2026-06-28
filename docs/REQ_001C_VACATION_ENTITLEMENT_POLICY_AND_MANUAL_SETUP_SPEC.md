# REQ-001C — Vacation Entitlement Policy & Manual Balance Setup Specification

**Type:** Product / Technical Specification
**Status:** Draft — Pending Approval
**Date:** 2026-06-28
**Author:** Claude Code (AI assistant)
**Task:** REQ-001C
**Depends on:** REQ-001A (Vacation Adjustment Spec), REQ-001B (Adjustment Ledger Implementation)
**Replaces / Supersedes:** Nothing (new requirement)

---

## 1. Requirement Summary

Production currently has 65 employees, almost none of whom have a `LeaveBalance` record for vacation. The real-world business has accumulated vacation entitlements and partial usage that are not yet reflected in the system. HR must manually enter each employee's:

1. Annual vacation **entitlement** (how many days they are entitled to per policy)
2. Actual **remaining** vacation balance (how many days they still have left as of today)

The system must suggest the correct entitlement from the employee's tenure (using the approved policy table) and derive `usedDays = entitledDays − remainingDays` so HR never enters a number that can produce inconsistent state. Employees with less than 1 year of service must not receive or see any vacation balance record.

This spec covers the design only. No code is written or modified. No migrations are generated. No data is mutated.

---

## 2. Current Problem

### 2.1 Production Gap

| Metric | State |
|--------|-------|
| Employees in system | ~65 |
| Employees with `LeaveBalance` VACATION record | ~0 |
| Employees with real remaining vacation days (business reality) | ~65 |
| System's knowledge of those days | **None** |

HR cannot currently approve or track vacation leave requests because the system has no balances to check against. Employees on STEP Connect see "No leave balance found" for vacation. Any leave approval that checks remaining days will fail or block all requests.

### 2.2 Root Cause

The system was built with a balance-creation API (`POST /leave-balances`), but no guided onboarding flow exists. HR must know the exact entitlement to enter, and must be able to specify that some days have already been used — neither of which the current create flow supports.

The current `POST /leave-balances` flow:
- Accepts `entitledDays` → stored as `totalDays`
- Sets `usedDays = 0` unconditionally
- Produces `remainingDays = totalDays` (i.e., assumes 0 days used)

This is unusable for initial setup because employees have already used some of their vacation days in real life.

### 2.3 Constraint from REQ-001B

`PATCH /leave-balances/:id` is now blocked for VACATION type — HR cannot directly overwrite `totalDays` or `usedDays` via the existing edit endpoint. The adjustment ledger (`POST /leave-balances/:id/adjustments`) adjusts `effectiveTotalDays` but does not touch `usedDays`. There is no existing path to set initial `usedDays > 0` for a VACATION balance.

---

## 3. Business Policy

### 3.1 Approved Vacation Entitlement Table

| Service Length (years) | Entitled Days / Year | Notes |
|------------------------|---------------------|-------|
| < 1 | 0 | No entitlement. Record must not exist. Balance must not be shown. |
| ≥ 1 and < 3 | 7 | Full year quota |
| ≥ 3 and < 5 | 10 | Full year quota |
| ≥ 5 and < 7 | 12 | Full year quota |
| ≥ 7 | 15 | Full year quota |

### 3.2 Vacation Request Policy

1. Standard vacation: request at least **1–2 days in advance**.
2. Vacation longer than **3 consecutive days**: request at least **1 month in advance**.
3. All vacation leave must be submitted **in writing** and approved by a supervisor before taking leave.
4. Leave balance must be sufficient; the approval API already enforces this via `effectiveTotal − usedDays`.

### 3.3 Future Policies (Out of Scope for REQ-001C)

The following leave policies were discussed but are **not included** in this implementation scope. They are documented here as future requirements only:

| Policy | Notes |
|--------|-------|
| Emergency family care leave (parents/children) | 4 days/year; eligible only for employees with ≥ 1 year service; only usable after vacation balance is fully used. |
| Leave without pay | Requires supervisor approval; no balance tracking needed in v1. |
| Personal leave (government errands, etc.) | 3 days/year; eligible only for employees with ≥ 1 year service. |

These should be designed and implemented as separate REQ items (REQ-002, REQ-003, etc.) after the vacation setup flow is verified in production.

---

## 4. Existing System Analysis

### 4.1 Data Models Inspected

**Employee** (`apps/api/prisma/schema.prisma`, line 110)
```
Employee {
  id           UUID (PK)
  employeeCode String (unique)
  firstName    String
  lastName     String
  hireDate     DateTime @db.Date   ← tenure source
  status       EmployeeStatus
  ...
}
```
`hireDate` is the **only date field representing when the employee joined**. There is no separate `startDate` or `probationEndDate` in the current schema. `createdAt` reflects when the database row was inserted and must not be used for tenure.

**LeaveBalance** (`schema.prisma`, line 202)
```
LeaveBalance {
  id          UUID (PK)
  employeeId  UUID → Employee
  leaveType   LeaveType (SICK | VACATION | PERSONAL | OTHER)
  year        Int
  totalDays   Int    ← original entitled quota (never mutated by adjustments)
  usedDays    Int    ← days deducted on leave approval
  UNIQUE(employeeId, leaveType, year)
}
```
`remainingDays` is computed server-side: `effectiveTotalDays − usedDays` where `effectiveTotalDays = totalDays + SUM(adjustment.deltaDays)`.

**LeaveAdjustment** (`schema.prisma`, line 220)
```
LeaveAdjustment {
  id             UUID (PK)
  leaveBalanceId UUID → LeaveBalance
  deltaDays      Float (signed, non-zero)
  reason         String (min 5 chars)
  actorUserId    String (JWT user)
  adjustedById   UUID? → Employee
  createdAt      DateTime (immutable)
}
```
Adjusts `effectiveTotalDays` only. Does not touch `usedDays`.

### 4.2 Existing API Endpoints for Leave Balance

| Method | Path | Roles | Current Behavior |
|--------|------|-------|-----------------|
| `POST` | `/leave-balances` | SUPER_ADMIN, HR_ADMIN | Create balance; sets `usedDays = 0` always |
| `GET` | `/leave-balances/my` | Any authenticated | Own balances |
| `GET` | `/leave-balances` | SUPER_ADMIN, HR_ADMIN, MANAGER | All balances (paginated) |
| `GET` | `/leave-balances/:id` | Owner / manager / admin | Single record |
| `PATCH` | `/leave-balances/:id` | SUPER_ADMIN, HR_ADMIN | VACATION: **blocked** (400). Non-VACATION: updates `entitledDays`/`usedDays`. |
| `POST` | `/leave-balances/:id/adjustments` | SUPER_ADMIN, HR_ADMIN | VACATION-only; adjusts `effectiveTotalDays`; writes `LeaveAdjustment` row + audit log |
| `GET` | `/leave-balances/:id/adjustments` | SUPER_ADMIN, HR_ADMIN | Lists adjustment history for a balance |

### 4.3 Admin Web UI (Current)

`apps/web/app/(app)/leave/page.tsx`:
- **Add Balance modal** (line 526): Accepts `employeeId`, `leaveType`, `year`, `entitledDays`. Does not ask for remaining days or usedDays. Does not suggest entitlement from tenure.
- **Adjust modal** (line 584): VACATION-only delta + reason. Writes to adjustment ledger.
- **Balance table** (line 459): Shows `totalDays`, `adjustmentDays`, `effectiveTotalDays`, `usedDays`, `remainingDays`. No inline tenure info.

### 4.4 STEP Connect Mobile (Current)

`apps/mobile/app/leave.tsx`:
- `BalanceCard` (line 146): Renders all leave balance records returned by `GET /leave-balances/my`. Shows remaining, used, total, and a progress bar.
- **No filtering by service length** exists client-side; the API returns whatever is in the database.
- If no VACATION record exists → no card is rendered (implicit empty-state behavior). This is the desired outcome for < 1 year employees.

### 4.5 Existing Files / Modules Inspected

| File | Purpose |
|------|---------|
| `apps/api/prisma/schema.prisma` | Employee, LeaveBalance, LeaveAdjustment models |
| `apps/api/src/leave-balance/leave-balance.service.ts` | Balance CRUD, `withRemaining` computation, VACATION PATCH block |
| `apps/api/src/leave-balance/leave-balance.controller.ts` | Route definitions, RBAC decorators |
| `apps/api/src/leave-balance/dto/create-leave-balance.dto.ts` | `entitledDays`, `employeeId`, `leaveType`, `year` |
| `apps/api/src/leave-adjustment/leave-adjustment.service.ts` | Adjustment ledger logic, audit log integration |
| `apps/api/src/leave-adjustment/leave-adjustment.controller.ts` | Adjustment endpoints, RBAC |
| `apps/web/app/(app)/leave/page.tsx` | Admin Web leave management UI |
| `apps/mobile/app/leave.tsx` | STEP Connect leave screen |

---

## 5. Tenure Calculation Design

### 5.1 Which Date Field?

**Use `hireDate`.**

Rationale: `hireDate` is the only field that represents when an employee started working. `createdAt` reflects database insertion time (not business start date). There is no `startDate`, `probationEndDate`, or `confirmationDate` in the schema.

If the business tracks a probation period or a different effective service start date, that field can be added in a future schema migration. Until then, `hireDate` is the source of truth.

### 5.2 As-of Date for Tenure Calculation

**Use today's date (current date at the time of API request).**

Rationale:
- Calculating as of January 1 of the year produces a different entitlement for employees who crossed a tier boundary during the year. This is a valid policy choice but requires clarification from HR.
- Calculating as of the employee's anniversary date is more complex and requires date-math that varies per employee.
- Calculating as of today is the simplest, most predictable, and most intuitive approach for HR doing manual setup.

**Open question (see Section 13.1):** The business must confirm whether entitlement tier is assessed as of today, January 1, or the employee's anniversary. This spec defaults to **today** pending confirmation.

### 5.3 Tenure Calculation Formula

```
completedYears = floor((today − hireDate) / 365.25)
```

Using `365.25` accounts for leap years. A more precise approach uses calendar-based year subtraction:

```
completedYears = (today.year − hireDate.year)
  minus 1 if (today.month, today.day) < (hireDate.month, hireDate.day)
```

Both approaches should produce identical results for the entitlement tiers above (which use 1-year intervals), but the calendar-based approach is preferred for clarity.

### 5.4 Mid-Year Tier Crossing

**Entitlement tier applies based on completed years as of today.**

If an employee's 3-year anniversary is July 15, 2026 and setup is run on June 28, 2026, the system suggests 7 days (≥1 and <3) not 10 days (≥3). After July 15, setup would suggest 10 days.

**Open question (see Section 13.2):** Should entitlement be prorated if an employee crosses a tier boundary mid-year? The business must decide.

### 5.5 Proration Policy

**Default: No proration.** Entitlement is the full annual quota for the tier the employee is currently in, regardless of when they joined or when they crossed a tier. This is the typical Thai labor practice and simplest to explain to employees.

If the business wishes to prorate for employees who joined mid-year (first year only), a proration formula can be added to the setup suggestion: `entitledDays × (remainingMonthsInYear / 12)`. This is a future option.

---

## 6. Manual Setup Workflow Design

### 6.1 Core Data Flow

```
Input from HR:
  employeeId   — who to set up
  year         — which year (default: current year)
  entitledDays — annual entitlement (suggested by system from tenure; HR can override)
  remainingDays — actual days remaining as of today

System derives:
  usedDays = entitledDays − remainingDays

Stored in LeaveBalance:
  totalDays = entitledDays
  usedDays  = entitledDays − remainingDays
  remainingDays = computed (not stored)
```

### 6.2 Why `remainingDays` Not `usedDays`?

HR knows how many vacation days an employee **has left**. HR does not typically track how many days have been used — that's a derived count from approved leave records. Asking HR to enter `usedDays` requires arithmetic. Entering `remainingDays` is natural ("Napat has 6 days left") and the system can derive the rest.

### 6.3 Step-by-Step Workflow

1. **HR opens "Vacation Setup" section** in Admin Web (under Leave Balance Admin or as a new dedicated section).
2. **HR selects an employee** from the employee dropdown.
3. **System displays employee info**: name, employee code, `hireDate`, computed tenure (e.g., "3 years 2 months").
4. **System suggests entitlement**: based on tenure tier lookup. e.g., "Suggested: 10 days (tier: ≥3 years)".
5. **HR reviews and optionally overrides** the suggested entitlement (integer ≥ 0).
6. **HR enters remaining days**: the actual balance as of today (integer ≥ 0, must be ≤ entitledDays).
7. **System shows preview**: `usedDays = entitledDays − remainingDays`.
8. **HR confirms and submits**.
9. **System creates** the `LeaveBalance` record with `totalDays = entitledDays`, `usedDays = entitledDays − remainingDays`.
10. **System writes** an audit log entry: `VACATION_BALANCE_SETUP`.
11. **HR moves to next employee** and repeats.

### 6.4 Handling Employees with < 1 Year Service

- The tenure suggestion panel should display: **"This employee is not eligible for vacation leave (service length < 1 year). No balance record should be created."**
- The submit button should be disabled or hidden for these employees.
- If HR attempts to create a VACATION balance for such an employee via the existing generic flow, a clear warning should be shown. The API may optionally enforce this as a 422.
- No `LeaveBalance` VACATION record should exist for these employees.
- On STEP Connect: since no record exists, no vacation card is shown. No client-side logic change is required.
- On Admin Web employee detail: vacation section should show "Not eligible (< 1 year service)" rather than "No balance found".

---

## 7. Option Comparison

### Option A — Manual One-by-One Using Existing Create Flow

**Summary:** HR uses the existing "Add Balance" modal on the Leave page. HR selects employee, `leaveType = VACATION`, year, and enters `entitledDays`. No change to `usedDays` on creation (stays 0). To record pre-existing usage, HR would use the adjustment ledger with a negative delta.

**Data model impact:** None.

**API impact:** None. Uses existing `POST /leave-balances`.

**UI impact:** Minor — add a note instructing HR to use the adjustment ledger for pre-existing usage. No structural change.

**Audit impact:** No audit on create (existing gap). Adjustment ledger writes audit log for negative deltas used to represent prior usage.

**Pros:**
- Zero backend code change
- Uses existing tested endpoints

**Cons:**
- HR must know the entitlement value without any guidance — no tenure-based suggestion
- No way to set `usedDays` directly; requires a second step (adjustment) that semantically means something different ("adjustment" not "initial setup")
- Adjustment ledger records the initial setup step as an "adjustment", polluting the ledger with non-adjustment entries
- HR confusion: "Why do I need to enter a negative adjustment for days I already used?"
- No protection for < 1 year employees
- No validation that `remainingDays ≤ entitledDays` at setup time

**Risks:**
- HR enters the wrong entitlement (common for 65 employees) with no correction guidance
- Adjustment ledger becomes semantically polluted — setup entries mixed with correction entries, breaking audit clarity
- Data integrity: no way to distinguish "initial setup via adjustment" from "later correction adjustment"

**Recommendation:** Not recommended for initial setup. Option A is suitable only for one-off corrections after initial setup is complete.

---

### Option B — Policy-Assisted Setup (Recommended)

**Summary:** A new dedicated setup endpoint (or extended create flow) that accepts `entitledDays + remainingDays`, computes `usedDays`, and creates the balance in one atomic step. The Admin Web setup form calculates and suggests entitlement from tenure.

**Data model impact:** None to Prisma schema. The existing `LeaveBalance.usedDays` field is already available for this purpose; it just needs to be settable at creation time for VACATION when done via the setup flow.

**API impact:** New endpoint or extended create DTO:

Option B1 — **New setup endpoint**:
```
POST /leave-balances/vacation-setup
Body: { employeeId, year, entitledDays, remainingDays }
Response: created LeaveBalance record with derived fields
```

This endpoint:
- Validates employee exists and has `hireDate`
- Validates `leaveType = VACATION` (implicit in the endpoint path)
- Validates `entitledDays ≥ 0`, `remainingDays ≥ 0`, `remainingDays ≤ entitledDays`
- Checks no VACATION balance already exists for this employee/year (duplicate prevention)
- Creates `LeaveBalance` with `totalDays = entitledDays`, `usedDays = entitledDays − remainingDays`
- Writes audit log `VACATION_BALANCE_SETUP`

Option B2 — **Extend existing `POST /leave-balances` DTO**:
Add optional `remainingDays` field. If present, derive `usedDays`. Downside: conflates general balance creation with vacation setup.

**Preferred: Option B1** (dedicated endpoint) for clarity and auditability.

The Admin Web also needs a new UI section or an enhanced "Add Balance" modal that:
- Fetches employee `hireDate` and shows computed tenure
- Shows the policy-suggested entitlement
- Allows override of entitlement
- Accepts remaining days input
- Shows a live preview of `usedDays`
- Disables submit for employees with < 1 year service

A separate read-only endpoint is also useful:
```
GET /leave-balances/vacation-setup/suggest?employeeId=...&year=...
Response: { completedYears, suggestedEntitledDays, isEligible }
```

**UI impact:**
- New "Vacation Setup" section in Admin Web `/leave` page, separate from the existing "Add Balance" modal
- Employee dropdown with tenure display
- Entitlement suggestion with override
- Remaining days input with preview
- Submit confirmation step

**Audit impact:**
New audit event `VACATION_BALANCE_SETUP` that records:
- actor (HR admin who performed setup)
- employeeId
- year
- entitledDays (suggested vs. overridden)
- remainingDays (HR-entered)
- usedDays (derived)
- hireDate
- completedYears (at time of setup)
- ipAddress, userAgent

**Pros:**
- HR sees the correct entitlement immediately — no manual policy lookup
- Single atomic operation: entitlement + remaining days → no second-step adjustments needed
- Clean semantic separation: setup event ≠ adjustment event
- Adjustment ledger remains clean (only post-setup corrections go there)
- Validation at setup prevents `remainingDays > entitledDays`
- Ineligible employees (< 1 year) are surfaced immediately
- Full audit trail from day one

**Cons:**
- Requires new API endpoint and new UI section
- More implementation work than Option A
- Backend service needs a new method
- Needs a `GET /suggest` sub-endpoint for tenure lookup

**Risks:**
- HR may override the suggested entitlement incorrectly (mitigation: require override reason in future v2)
- If `hireDate` is wrong in the database, the tenure suggestion will be wrong (mitigation: show `hireDate` in the UI so HR can spot errors)

**Recommendation: Option B1 is the recommended approach.** It is the only option that provides a clean, auditable, HR-friendly setup flow that does not pollute the adjustment ledger.

---

### Option C — Bulk CSV / Import

**Summary:** HR prepares a CSV with employee code, year, entitledDays, remainingDays. Uploads via Admin Web. System dry-runs the import, shows preview with errors, then commits on confirmation.

**Data model impact:** None to Prisma.

**API impact:** New endpoints:
- `POST /leave-balances/vacation-setup/import/preview` — validates CSV, returns row-by-row preview
- `POST /leave-balances/vacation-setup/import/commit` — creates all valid rows atomically

**UI impact:** CSV upload component, preview table with error rows highlighted, confirm button.

**Audit impact:** Bulk audit record with import batch ID; one sub-event per employee setup.

**Pros:**
- Fastest for HR to set up 65 employees at once
- Reduces click fatigue

**Cons:**
- Significantly more implementation complexity (CSV parsing, error handling, dry-run/commit pattern)
- HR must prepare a spreadsheet correctly — errors in CSV are harder to catch than a form
- Higher risk of bulk mistakes (one wrong formula in Excel = 65 wrong entries)
- A dry-run that looks correct may still commit incorrectly if data changes between preview and commit

**Risks:**
- CSV encoding issues (Thai names with special characters)
- HR uploads wrong year or wrong employee codes
- Partial commits on error (mitigated by transaction, but complex rollback UX)

**Recommendation:** Defer to a later release (v2) after Option B is verified in production and the entitlement policy is confirmed to be stable. A CSV import tool is valuable but is too risky as the first setup mechanism when neither the data nor the policy has been verified end-to-end.

---

## 8. Recommended Approach: Option B1 (Policy-Assisted Manual Setup)

### 8.1 Summary

Implement a dedicated `POST /leave-balances/vacation-setup` endpoint with a companion `GET /leave-balances/vacation-setup/suggest` endpoint. Add a new "Vacation Setup" section to the Admin Web leave page. Process is one-employee-at-a-time for v1.

### 8.2 API Design

#### GET /leave-balances/vacation-setup/suggest

**Purpose:** Calculate tenure and suggest entitlement for a given employee and year.

**Roles:** SUPER_ADMIN, HR_ADMIN

**Query parameters:** `employeeId` (UUID, required), `year` (integer, required)

**Response (200):**
```json
{
  "employeeId": "uuid",
  "year": 2026,
  "hireDate": "2022-03-15",
  "completedYears": 4,
  "completedMonths": 51,
  "isEligible": true,
  "suggestedEntitledDays": 10,
  "tierLabel": "≥3 years and <5 years",
  "hasExistingBalance": false
}
```

If `isEligible = false` (< 1 year service), `suggestedEntitledDays = 0`.
If `hasExistingBalance = true`, the endpoint warns HR rather than blocking (HR may want to review).

**Response (404):** Employee not found.

#### POST /leave-balances/vacation-setup

**Purpose:** Create a vacation balance record with both entitlement and remaining days provided by HR.

**Roles:** SUPER_ADMIN, HR_ADMIN

**Request body:**
```json
{
  "employeeId": "uuid",
  "year": 2026,
  "entitledDays": 10,
  "remainingDays": 7,
  "setupNote": "Initial manual setup for FY2026 — employee confirmed 7 days remaining"
}
```

**Fields:**
- `employeeId`: UUID, required
- `year`: integer ≥ 2020, required
- `entitledDays`: integer ≥ 0, required
- `remainingDays`: integer ≥ 0, required, must be ≤ `entitledDays`
- `setupNote`: string, optional, max 500 chars (stored in audit metadata)

**Derived:**
- `usedDays = entitledDays − remainingDays` (computed by service before insert)

**Validations:**
1. Employee exists → 404 otherwise
2. Employee `hireDate` is present → 400 if missing
3. `entitledDays ≥ 0` → DTO min validation
4. `remainingDays ≥ 0` → DTO min validation
5. `remainingDays ≤ entitledDays` → 422 "Remaining days cannot exceed entitled days"
6. No existing VACATION balance for `employeeId/year` → 409 "Vacation balance already exists for this employee and year"
7. `completedYears ≥ 1` (employee is eligible) → 422 "Employee is not eligible for vacation leave (service length < 1 year)"

**Response (201):**
```json
{
  "id": "uuid",
  "employeeId": "uuid",
  "leaveType": "VACATION",
  "year": 2026,
  "totalDays": 10,
  "usedDays": 3,
  "adjustmentDays": 0,
  "effectiveTotalDays": 10,
  "remainingDays": 7,
  "employee": { "id": "...", "firstName": "...", "lastName": "...", "employeeCode": "..." },
  "createdAt": "2026-06-28T..."
}
```

**Audit event `VACATION_BALANCE_SETUP` written on success:**
```json
{
  "action": "VACATION_BALANCE_SETUP",
  "targetType": "LEAVE_BALANCE",
  "targetId": "<leaveBalanceId>",
  "actorUserId": "<jwt-user-id>",
  "actorRole": "HR_ADMIN",
  "ipAddress": "...",
  "metadata": {
    "employeeId": "...",
    "year": 2026,
    "entitledDays": 10,
    "remainingDays": 7,
    "usedDays": 3,
    "hireDate": "2022-03-15",
    "completedYears": 4,
    "setupNote": "Initial manual setup...",
    "suggestedEntitledDays": 10,
    "entitlementOverridden": false
  }
}
```

`entitlementOverridden: true` if the HR-entered `entitledDays` differs from the system-suggested value.

### 8.3 Admin Web UI Proposal

**New section: "Vacation Balance Setup"** on the Admin Web `/leave` page, above or below the existing "Leave Balance Admin" section. Initially shows as a collapsible section to avoid cluttering the page.

**UI flow:**

```
[ Vacation Balance Setup ]  (expand toggle)

  Employee:  [ Dropdown — search by name / employee code ]
  Year:      [ 2026 ▾ ]

  — (After selecting employee) —

  Employee:    Napat Sombut (EMP-042)
  Hire Date:   15 Mar 2022
  Tenure:      4 years 3 months
  Eligible:    YES — Tier: ≥3 years and <5 years

  Suggested entitlement:   10 days
  Entitlement (confirm or override):  [ 10 ]  days

  Remaining days (actual):  [ ___ ]  days

  Preview:
    Entitlement:   10 days
    Remaining:      7 days
    Used (derived): 3 days

  Setup note (optional):  [ _________________________ ]

  [ Cancel ]  [ Create Vacation Balance ]
```

For ineligible employees (< 1 year):
```
  Eligible:    NO — Service length < 1 year (not eligible for vacation leave)
  [Create Vacation Balance] button is hidden/disabled
```

If a balance already exists:
```
  ⚠ A vacation balance for this employee/year already exists.
    Remaining: 7 / 10 days. Use the Adjust button to modify.
  [Create Vacation Balance] button is hidden/disabled
```

### 8.4 STEP Connect Display Rule

No client-side change is required in v1. The mobile app renders `BalanceCard` for each record returned by `GET /leave-balances/my`. Since no VACATION record will exist for ineligible employees, no vacation card will appear.

The API-level eligibility check in `POST /vacation-setup` prevents creating records for < 1 year employees. As a belt-and-suspenders measure, the suggest endpoint also returns `isEligible: false` so the Admin Web can warn HR before submission.

If future requirements ask for an explicit "not eligible" message on mobile for employees with < 1 year of service, the mobile app would need to call a tenure-awareness endpoint or embed the eligibility check client-side. This is deferred to a future task.

### 8.5 Interaction with REQ-001B Adjustment Ledger

The adjustment ledger (`LeaveAdjustment`, `POST /leave-balances/:id/adjustments`) is designed for **post-setup corrections** only:

| Use Case | Mechanism |
|----------|-----------|
| Initial setup: set entitlement + remaining | `POST /leave-balances/vacation-setup` (new) |
| Ongoing: award extra days for special occasions | `POST /leave-balances/:id/adjustments` (existing) |
| Ongoing: claw back days | `POST /leave-balances/:id/adjustments` (existing) |
| Ongoing: correct a data entry error in entitlement | `POST /leave-balances/:id/adjustments` (existing, with negative delta) |
| Correct a wrong `usedDays` from setup | **Open question — see Section 13.4** |

The setup endpoint writes to `LeaveBalance.totalDays` and `LeaveBalance.usedDays` directly (at creation time). After initial setup, `usedDays` is managed by the leave approval flow (atomic increment on approval). If `usedDays` needs to be corrected post-setup, a workaround is currently required (delete and re-create, or a future admin correction endpoint). This limitation is acceptable for v1.

### 8.6 Future Adjustments After Setup

After initial setup:
- **Entitlement changes**: Use `POST /leave-balances/:id/adjustments` (adjustment ledger)
- **Used days deductions**: Automatic via leave approval flow (`leave.service.ts`)
- **Used days corrections**: Requires admin intervention; no existing endpoint; document as known limitation

---

## 9. Data Model Considerations

### 9.1 No Schema Changes Required

The existing `LeaveBalance` model has all required fields:
- `totalDays` (Int): stores entitlement
- `usedDays` (Int, default 0): stores used days — can be set > 0 at creation time; no schema change needed

The only change is in the service layer: `POST /leave-balances` currently hardcodes `usedDays: 0`. The new setup endpoint will compute and write the correct initial `usedDays`.

### 9.2 Why Not Add a `setupNote` Column?

The `setupNote` entered by HR during initial setup is audit data, not operational data. It should be stored in the `AuditLog` table (`metadata.setupNote`) rather than in `LeaveBalance`. This keeps `LeaveBalance` clean and avoids a schema migration for a single use case.

### 9.3 Why Not Rename `totalDays`?

The `totalDays` field is confusingly named — it represents the "entitled quota" not the mathematical total. A rename (`entitledDays`) has been on the backlog since REQ-001A. This rename should be done as a separate migration when time permits, not bundled with this task (to minimize migration risk). The new setup endpoint should use the name `entitledDays` in its DTO and response, continuing the convention established in REQ-001B, while the DB column remains `totalDays`.

---

## 10. Validation Rules

### 10.1 Input Validation

| Rule | Behavior |
|------|----------|
| `entitledDays ≥ 0` | DTO `@Min(0)` → 400 |
| `remainingDays ≥ 0` | DTO `@Min(0)` → 400 |
| `remainingDays ≤ entitledDays` | Service-level check → 422 |
| `year ≥ 2020` | DTO `@Min(2020)` → 400 |
| `employeeId` is valid UUID | DTO `@IsUUID` → 400 |
| Employee exists | Service lookup → 404 |
| Employee has `hireDate` | Service check → 400 |

### 10.2 Duplicate Prevention

The existing `@@unique([employeeId, leaveType, year])` constraint on `LeaveBalance` prevents duplicate records at the database level. The service should also check proactively and return a 409 with a clear message: "A vacation balance for this employee and year already exists."

The Admin Web should call `GET /vacation-setup/suggest` first, which returns `hasExistingBalance: true`, allowing the UI to warn HR before they complete the form.

### 10.3 Eligibility Guard

The service must:
1. Look up the employee's `hireDate`
2. Compute `completedYears` as of today
3. If `completedYears < 1`, return **422** "Employee is not eligible for vacation leave (service length < 1 year)"

This is a hard guard. HR cannot bypass it. If the business has an exceptional case (e.g., an employee who was promoted but started a few months ago), HR must contact the system administrator to handle it via a different mechanism.

---

## 11. Audit Log Proposal

Every successful setup must write an `AuditLog` record with the following fields:

| AuditLog field | Value |
|----------------|-------|
| `action` | `VACATION_BALANCE_SETUP` |
| `targetType` | `LEAVE_BALANCE` |
| `targetId` | leave balance ID (after creation) |
| `targetLabel` | `"VACATION 2026 — EMP-042"` |
| `actorUserId` | JWT user ID |
| `actorRole` | JWT user role |
| `result` | `SUCCESS` |
| `ipAddress` | request IP |
| `userAgent` | request user agent |
| `metadata` | JSON — see Section 8.2 |

The `metadata.entitlementOverridden` boolean allows future auditors to identify cases where HR overrode the system suggestion.

Same best-effort pattern as REQ-001B: audit failure must never block the setup operation.

---

## 12. Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Employee has 0 remaining days (fully used entitlement) | Valid: `entitledDays=10, remainingDays=0, usedDays=10`. Allowed. |
| Employee has full remaining days (never used vacation) | Valid: `entitledDays=10, remainingDays=10, usedDays=0`. This is the same as the existing `POST /leave-balances` behavior. |
| HR enters `remainingDays > entitledDays` | 422: "Remaining days cannot exceed entitled days" |
| Employee has exactly 1 year service today | Eligible. `completedYears = 1`. Tier: ≥1 year and <3 years. Suggested: 7 days. |
| Employee has 11 months 29 days of service | Not eligible. 422 returned. |
| Employee is RESIGNED or INACTIVE | No guard at setup time in v1; HR may still set up historical balances. Consider adding a warning in the UI. |
| Setup for a past year (e.g., 2025) | Allowed. Tenure is calculated as of today. HR must enter appropriate `remainingDays` for that year. Consider warning if year < current year. |
| Setup for a future year | Should be blocked: `year > currentYear` → 422 "Cannot set up balance for a future year". |
| `entitledDays` overridden to 0 by HR | Allowed. Represents a special case (e.g., employee returned from extended leave, quota consumed by previous system). |
| `hireDate` is null in database | 400: "Employee hireDate is not set. Update the employee record before setting up vacation balance." |
| Employee changes tier mid-year (anniversary crosses tier boundary during year) | System uses today's tier. Post-anniversary a re-setup is not needed; the existing balance stays. If entitlement tier changes, HR uses adjustment ledger to add/remove days. |

---

## 13. Security and RBAC Considerations

| Area | Assessment |
|------|-----------|
| Auth | Both new endpoints must be behind `JwtAuthGuard` |
| RBAC | `POST /vacation-setup` and `GET /vacation-setup/suggest`: SUPER_ADMIN, HR_ADMIN only. MANAGER and EMPLOYEE must receive 403. |
| Data privacy | `hireDate` is returned in the suggest response. This is internal HR data, not personal sensitive data. Response is only accessible to SUPER_ADMIN and HR_ADMIN. |
| Audit | `VACATION_BALANCE_SETUP` event written on success. No passwords, tokens, or sensitive values in metadata. |
| Override tracking | `entitlementOverridden` flag in audit metadata surfaces cases where HR deviated from system policy. |
| Eligibility bypass | Service-level 422 guard prevents creating balances for ineligible employees even if HR tries via direct API call. |
| Secrets/logging | `hireDate`, `completedYears`, `entitledDays`, `remainingDays`, `usedDays` are non-sensitive operational values. Safe to log. |
| New endpoints protected | `POST /leave-balances/vacation-setup` → JwtAuthGuard + RolesGuard (SUPER_ADMIN, HR_ADMIN); `GET /leave-balances/vacation-setup/suggest` → same. |
| Risk level | **LOW** — new endpoints only, no schema changes, no data mutations in existing records |
| Security decision | **PASS** (pending implementation and security review at implementation time) |

---

## 14. Production Safety Considerations

1. **One at a time**: The v1 flow is one employee at a time. This limits blast radius if HR enters wrong data for one employee. The other 64 employees are unaffected.

2. **No migration required**: The existing `LeaveBalance` model supports `usedDays > 0` at creation time. No schema change means no migration risk.

3. **Idempotency via 409**: If HR accidentally submits twice, the second request fails with 409. No duplicate records are created.

4. **Audit from day one**: Every setup event is logged. If errors are discovered later, the audit log shows exactly what was entered, who entered it, and when.

5. **Rollback path**: If a setup entry is wrong, the correction path is:
   - If `entitledDays` is wrong: Use adjustment ledger to add/remove days.
   - If `remainingDays` (and thus `usedDays`) is wrong: A future admin correction endpoint is needed. For v1, the workaround is to delete the balance record (database-level, requires engineering intervention) and re-run setup. Document this in the HR runbook.

6. **No Docker destructive commands**: This spec produces no migrations, no seed data, no Docker operations.

7. **65-employee scale**: 65 employees is manageable one-by-one. An experienced HR admin can set up 65 employees in approximately 30–45 minutes using the guided form.

---

## 15. Non-Goals

The following are explicitly out of scope for REQ-001C:

- Bulk CSV import (deferred to v2, see Option C)
- Proration of entitlement for partial years
- Automatic entitlement assignment (no batch "assign entitlements to all employees" operation)
- Emergency family care leave setup
- Personal leave setup
- Leave without pay configuration
- Automatic yearly rollover of unused vacation days
- Year-end carryover policy
- Leave request policy enforcement (advance notice rules) — not enforced by the API in v1; advisory-only
- Any Prisma schema migration
- Any database seed or mutation
- Any change to the adjustment ledger behavior (REQ-001B)

---

## 16. Implementation Plan (After Approval)

The following plan is provided for planning purposes only. No code is written until this spec is approved by the user.

### Phase 1: Backend

1. Add `VacationSetupModule` in `apps/api/src/vacation-setup/` (or extend `LeaveBalanceModule`)
2. Create `vacation-setup.dto.ts` with `employeeId`, `year`, `entitledDays`, `remainingDays`, `setupNote`
3. Create `vacation-setup.service.ts` with:
   - `suggest(employeeId, year)` — tenure calculation + tier lookup + existing balance check
   - `setup(dto, ctx)` — validation, creation, audit log
4. Create `vacation-setup.controller.ts` with:
   - `GET /leave-balances/vacation-setup/suggest`
   - `POST /leave-balances/vacation-setup`
5. Register module in `app.module.ts`
6. Write service unit tests (suggest + setup + all edge cases)
7. Write controller unit tests (RBAC assertions)

### Phase 2: Admin Web

1. Add "Vacation Balance Setup" section to `apps/web/app/(app)/leave/page.tsx`
2. Wire to `GET /suggest` for tenure display and entitlement suggestion
3. Add entitlement override input + remaining days input + live preview
4. Wire submit to `POST /vacation-setup`
5. Add ineligibility warning for < 1 year employees
6. Add existing-balance warning and disable submit if balance exists

### Phase 3: Verification

1. Run `./scripts/verify.sh`
2. Run `./scripts/docker-verify.sh`
3. Run `./scripts/api-smoke-test.sh`
4. Manual test: set up 3 employees with different tenures (< 1 year, 2 years, 5 years)
5. Verify audit logs contain `VACATION_BALANCE_SETUP` events
6. Verify STEP Connect shows correct balance cards after setup
7. Run `./scripts/security-review.sh`

---

## 17. Open Questions for the User

### 13.1 Tenure Assessment Date

> **Q: Should entitlement tier be assessed as of today, January 1 of the target year, or the employee's anniversary date?**

Default in this spec: **today's date**.

Impact: An employee whose 3-year anniversary is August 1, 2026 would be suggested 7 days if setup is done in June 2026, but 10 days if setup is done in September 2026. HR may want to use a fixed date (e.g., January 1) so the same employee always gets the same entitlement for the same year regardless of when setup is run.

### 13.2 Proration for First Year or Tier-Crossing Year

> **Q: Should entitlement be prorated for employees who join mid-year or who cross a tier boundary mid-year?**

Default in this spec: **no proration**. Full tier quota applies.

### 13.3 HR Override Restriction

> **Q: Should HR be required to provide a reason when overriding the system-suggested entitlement?**

Default in this spec: **no required reason for override**. HR can enter any `entitledDays` value ≥ 0. The override is flagged in the audit log (`entitlementOverridden: true`).

If the business wants stronger accountability, add a required `overrideReason` field that is mandatory when `entitledDays ≠ suggestedEntitledDays`.

### 13.4 Correction Path for Wrong `usedDays`

> **Q: If HR enters the wrong `remainingDays` (and thus wrong `usedDays`) during setup, how should the correction be handled?**

Current design: The adjustment ledger adjusts `effectiveTotalDays` (not `usedDays`). There is no existing API path to correct `usedDays` after creation. The only option today is engineering-level deletion and re-creation.

Options:
- Accept this as a v1 known limitation and document the correction procedure.
- Add a `usedDays` correction endpoint (e.g., `PATCH /leave-balances/:id/correct-used-days`) guarded by SUPER_ADMIN only, with mandatory audit logging.

### 13.5 Setup Year Scope

> **Q: Should HR be able to set up vacation balances for past years (e.g., 2024, 2025) as well as the current year?**

Default in this spec: **Allowed, with a UI warning for past years.** Future years (`year > currentYear`) are blocked with 422.

### 13.6 RESIGNED / INACTIVE Employees

> **Q: Should vacation setup be allowed for employees with status RESIGNED or INACTIVE?**

Default in this spec: **Allowed (no status guard at the API level)**. A warning is shown in the Admin Web UI. HR may legitimately need to record historical balances for resigned employees for legal/record-keeping reasons.

### 13.7 `hireDate` Discrepancy

> **Q: If an employee's `hireDate` in the system is wrong (e.g., was entered incorrectly during onboarding), who corrects it and when?**

This is a data quality issue. The setup form should display `hireDate` prominently so HR can spot discrepancies. If `hireDate` is wrong, it must be corrected in the employee record first (via `PATCH /employees/:id`), then setup can proceed. This is not an edge case to be handled by the setup flow itself.

---

## 18. Future Requirements

The following were discussed during this requirement gathering session and are documented for future planning:

| Future REQ | Description | Trigger |
|------------|-------------|---------|
| REQ-001D or REQ-002 | Emergency family care leave (4 days/year, ≥1 year service, only after vacation exhausted) | After vacation setup is verified |
| REQ-003 | Personal leave (3 days/year, ≥1 year service, government errands) | After vacation setup is verified |
| REQ-004 | Leave without pay (supervisor approval, no balance tracking) | Policy confirmed |
| REQ-001D or bulk | Bulk CSV import for vacation setup | After v1 one-by-one flow is validated |
| REQ-005 | Year-end vacation carryover / rollover policy | Annual |
| REQ-006 | Automatic annual leave entitlement renewal | Annual |
| REQ-007 | Proration for mid-year joiners | Policy decision |
| REQ-008 | Leave request policy enforcement (advance notice rules) | Enforcement phase |

---

*This document is a specification only. No runtime code was changed, no database schema was modified, and no data was mutated during its preparation.*
