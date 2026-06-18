import { useEffect } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/auth/useAuth';
import { useDashboard } from '../src/hooks/useDashboard';
import { FeatureCard } from '../src/components/FeatureCard';
import { roleLabel, canUseManagerApproval, isAdmin, canSeeDashboard } from '../src/utils/roles';

function formatTime(date: Date | null): string {
  if (!date) return '—';
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function SummaryCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={[styles.summaryValue, color ? { color } : undefined]}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
      {sub ? <Text style={styles.summarySub}>{sub}</Text> : null}
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const { loadState, dashboard, profile, error, lastUpdated, refresh } = useDashboard();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated]);

  const handleLogout = async () => {
    await signOut();
    router.replace('/login');
  };

  if (isLoading) {
    return (
      <View style={styles.fullCenter}>
        <ActivityIndicator color="#1a56db" size="large" />
        <Text style={styles.loadingText}>กำลังโหลดข้อมูล...</Text>
      </View>
    );
  }

  const displayUser = profile ?? user;
  const role = displayUser?.role ?? '';
  const avatarLetter = displayUser?.email?.charAt(0).toUpperCase() ?? '?';
  const isRefreshing = loadState === 'loading';
  const showDashboard = canSeeDashboard(role);
  const showManagerApproval = canUseManagerApproval(role);
  const showHRSection = isAdmin(role);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor="#1a56db"
          />
        }
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appName}>HR Mobile</Text>
            <Text style={styles.greeting}>
              สวัสดี{displayUser ? `, ${displayUser.email.split('@')[0]}` : ''}
            </Text>
          </View>
          <Pressable
            style={({ pressed }) => [styles.logoutBtn, pressed && styles.pressed]}
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="ออกจากระบบ"
          >
            <Text style={styles.logoutBtnText}>ออกจากระบบ</Text>
          </Pressable>
        </View>

        {/* ── Profile card ────────────────────────────────────────────── */}
        {displayUser && (
          <View style={styles.card}>
            <View style={styles.profileRow}>
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarText}>{avatarLetter}</Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileEmail}>{displayUser.email}</Text>
                <View style={styles.roleBadgeRow}>
                  <View style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{roleLabel(role)}</Text>
                  </View>
                </View>
                <View style={styles.statusBadge}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>ออนไลน์</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ── Dashboard overview — admin/manager/HR only ───────────────── */}
        {showDashboard && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>ภาพรวมองค์กร</Text>

            {loadState === 'loading' && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#1a56db" size="small" />
                <Text style={styles.loadingInlineText}>กำลังโหลดข้อมูล...</Text>
              </View>
            )}

            {loadState === 'error' && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error ?? 'ไม่สามารถโหลดข้อมูลได้'}</Text>
                <Pressable
                  style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
                  onPress={refresh}
                  accessibilityRole="button"
                  accessibilityLabel="ลองใหม่อีกครั้ง"
                >
                  <Text style={styles.retryText}>ลองใหม่อีกครั้ง</Text>
                </Pressable>
              </View>
            )}

            {loadState === 'success' && dashboard && (
              <>
                <View style={styles.summaryGrid}>
                  <SummaryCard
                    label="พนักงานทั้งหมด"
                    value={dashboard.employees.totalEmployees}
                    sub={`ใช้งาน ${dashboard.employees.activeEmployees}`}
                    color="#1a56db"
                  />
                  <SummaryCard
                    label="แผนกทั้งหมด"
                    value={dashboard.employees.totalDepartments}
                    sub={`ตำแหน่ง ${dashboard.employees.totalPositions}`}
                    color="#7c3aed"
                  />
                  <SummaryCard
                    label="ลงเวลาวันนี้"
                    value={dashboard.attendance.todayClockedInCount}
                    sub={`สาย ${dashboard.attendance.todayLateCount}`}
                    color="#059669"
                  />
                  <SummaryCard
                    label="คำขอลารอดำเนินการ"
                    value={dashboard.leave.pendingLeaveRequests}
                    sub={`อนุมัติแล้ว ${dashboard.leave.approvedLeaveRequests}`}
                    color="#d97706"
                  />
                </View>
                <View style={styles.updatedRow}>
                  <Text style={styles.updatedLabel}>อัปเดตล่าสุด</Text>
                  <Text style={styles.updatedValue}>{formatTime(lastUpdated)}</Text>
                </View>
              </>
            )}

            {loadState === 'idle' && (
              <Text style={styles.idleText}>กำลังเตรียมข้อมูล...</Text>
            )}
          </View>
        )}

        {/* ── Quick Actions ─────────────────────────────────────────────── */}
        <Text style={styles.sectionHeader}>เมนูหลัก</Text>
        <View style={styles.featureGrid}>
          <FeatureCard
            title="ลงเวลา"
            description="บันทึกเวลาเข้า-ออกงาน"
            icon="🕐"
            enabled
            onPress={() => router.push('/attendance')}
          />
          <FeatureCard
            title="ขออนุมัติลา"
            description="ส่งคำขอวันหยุด/ลาป่วย"
            icon="📋"
            enabled
            onPress={() => router.push('/leave')}
          />
          <FeatureCard
            title="โปรไฟล์ของฉัน"
            description="ข้อมูลส่วนตัวและสัญญาจ้าง"
            icon="👤"
            enabled={false}
            badge="เร็ว ๆ นี้"
          />
        </View>

        {/* ── Manager Approval entry point — manager/HR/admin only ─────── */}
        {showManagerApproval && (
          <>
            <Text style={styles.sectionHeader}>สำหรับผู้จัดการ</Text>
            <View style={styles.featureGrid}>
              <FeatureCard
                title="อนุมัติคำขอลา"
                description="ฟีเจอร์นี้จะเปิดใช้งานใน T-050"
                icon="✅"
                enabled={false}
                badge="เร็ว ๆ นี้"
              />
            </View>
          </>
        )}

        {/* ── HR admin section ─────────────────────────────────────────── */}
        {showHRSection && (
          <>
            <Text style={styles.sectionHeader}>สำหรับ HR / ผู้ดูแลระบบ</Text>
            <View style={styles.featureGrid}>
              <FeatureCard
                title="ภาพรวม HR"
                description="สรุปข้อมูลพนักงานและแผนก"
                icon="📊"
                enabled={false}
                badge="เร็ว ๆ นี้"
              />
              <FeatureCard
                title="จัดการพนักงาน"
                description="ดูและแก้ไขข้อมูลพนักงาน"
                icon="👥"
                enabled={false}
                badge="เร็ว ๆ นี้"
              />
            </View>
          </>
        )}

        {/* ── Refresh button ───────────────────────────────────────────── */}
        <Pressable
          style={({ pressed }) => [
            styles.refreshBtn,
            pressed && styles.pressed,
            isRefreshing && styles.disabled,
          ]}
          onPress={refresh}
          disabled={isRefreshing}
          accessibilityRole="button"
          accessibilityLabel="อัปเดตข้อมูล"
        >
          <Text style={styles.refreshBtnText}>
            {isRefreshing ? 'กำลังโหลดข้อมูล...' : 'อัปเดตข้อมูล'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fullCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scroll: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  appName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  greeting: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  logoutBtn: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#ffffff',
  },
  logoutBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },

  // Card container
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },

  // Profile card
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1a56db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
    gap: 5,
  },
  profileEmail: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  roleBadgeRow: {
    flexDirection: 'row',
  },
  roleBadge: {
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e40af',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#16a34a',
  },
  statusText: {
    fontSize: 11,
    color: '#16a34a',
    fontWeight: '500',
  },

  // Section headers
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Summary grid
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    backgroundColor: '#f8f9fa',
    borderRadius: 10,
    padding: 12,
    width: '47%',
    gap: 3,
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  summarySub: {
    fontSize: 11,
    color: '#9ca3af',
    marginTop: 1,
  },
  updatedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  updatedLabel: {
    fontSize: 11,
    color: '#9ca3af',
  },
  updatedValue: {
    fontSize: 11,
    color: '#9ca3af',
    fontWeight: '500',
  },

  // Loading/error inline
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
  },
  loadingInlineText: {
    fontSize: 13,
    color: '#6b7280',
  },
  errorBox: {
    gap: 10,
    paddingVertical: 4,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
  },
  retryBtn: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  retryText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#1a56db',
  },
  idleText: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 8,
  },

  // Feature grid
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },

  // Refresh button
  refreshBtn: {
    backgroundColor: '#1a56db',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  refreshBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Shared states
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.55 },
});
