export type AppRole = 'SUPER_ADMIN' | 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE';

export function roleLabel(role: string): string {
  switch (role as AppRole) {
    case 'SUPER_ADMIN': return 'ผู้ดูแลระบบสูงสุด';
    case 'HR_ADMIN': return 'HR Admin';
    case 'MANAGER': return 'ผู้จัดการ';
    case 'EMPLOYEE': return 'พนักงาน';
    default: return role.replace(/_/g, ' ');
  }
}

export function isAdmin(role: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'HR_ADMIN';
}

export function isManager(role: string): boolean {
  return role === 'MANAGER';
}

/** True for roles allowed to see the manager approval entry point */
export function canUseManagerApproval(role: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'HR_ADMIN' || role === 'MANAGER';
}

/** True for all authenticated roles — employee self-service features */
export function canUseEmployeeSelfService(_role: string): boolean {
  return true;
}

/** True for roles that can access the org-wide dashboard (backend-gated) */
export function canSeeDashboard(role: string): boolean {
  return role === 'SUPER_ADMIN' || role === 'HR_ADMIN' || role === 'MANAGER';
}
