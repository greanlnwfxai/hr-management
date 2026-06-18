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

const FEATURE_CARDS: Array<{ key: string; th: string; en: string; icon: string }> = [
  { key: 'profile', th: 'โปรไฟล์ของฉัน', en: 'My Profile', icon: '👤' },
  { key: 'attendance', th: 'การลงเวลา', en: 'Attendance', icon: '🕐' },
  { key: 'leave', th: 'คำขอลางาน', en: 'Leave Request', icon: '📋' },
  { key: 'dashboard', th: 'แดชบอร์ด', en: 'Dashboard', icon: '📊' },
];

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
        <Text style={styles.loadingText}>กำลังโหลดข้อมูล</Text>
      </View>
    );
  }

  const displayUser = profile ?? user;
  const avatarLetter = displayUser?.email?.charAt(0).toUpperCase() ?? '?';
  const roleTh = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN': return 'ผู้ดูแลระบบ';
      case 'HR_ADMIN': return 'ฝ่ายบุคคล';
      case 'MANAGER': return 'ผู้จัดการ';
      case 'EMPLOYEE': return 'พนักงาน';
      default: return role.replace(/_/g, ' ');
    }
  };

  const isRefreshing = loadState === 'loading';

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
                <Text style={styles.profileRole}>{roleTh(displayUser.role)}</Text>
                <View style={styles.statusBadge}>
                  <View style={styles.statusDot} />
                  <Text style={styles.statusText}>ผู้ใช้งานที่เข้าสู่ระบบ</Text>
                </View>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>บทบาท</Text>
              <Text style={styles.metaValue}>{displayUser.role.replace(/_/g, '_')}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>สถานะผู้ใช้</Text>
              <Text style={[styles.metaValue, { color: '#16a34a' }]}>ใช้งานอยู่</Text>
            </View>
          </View>
        )}

        {/* ── Dashboard summary ────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>ภาพรวมระบบ</Text>

          {loadState === 'loading' && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#1a56db" size="small" />
              <Text style={styles.loadingInlineText}>กำลังโหลดข้อมูล</Text>
            </View>
          )}

          {loadState === 'error' && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error ?? 'ไม่สามารถโหลดข้อมูลได้'}</Text>
              <Pressable
                style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
                onPress={refresh}
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
                  label="การลงเวลาวันนี้"
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

        {/* ── Feature cards ────────────────────────────────────────────── */}
        <Text style={styles.sectionTitle}>เมนูหลัก</Text>
        <View style={styles.featureGrid}>
          {FEATURE_CARDS.map((card) => {
            const isAttendance = card.key === 'attendance';
            const isLeave = card.key === 'leave';
            if (isAttendance) {
              return (
                <Pressable
                  key={card.key}
                  style={({ pressed }) => [styles.featureCard, styles.featureCardActive, pressed && styles.pressed]}
                  onPress={() => router.push('/attendance')}
                  accessibilityRole="button"
                  accessibilityLabel={card.th}
                >
                  <Text style={styles.featureIcon}>{card.icon}</Text>
                  <Text style={styles.featureTh}>{card.th}</Text>
                  <Text style={styles.featureEn}>{card.en}</Text>
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>เปิดใช้งาน</Text>
                  </View>
                </Pressable>
              );
            }
            if (isLeave) {
              return (
                <Pressable
                  key={card.key}
                  style={({ pressed }) => [styles.featureCard, styles.featureCardActive, pressed && styles.pressed]}
                  onPress={() => router.push('/leave')}
                  accessibilityRole="button"
                  accessibilityLabel={card.th}
                >
                  <Text style={styles.featureIcon}>{card.icon}</Text>
                  <Text style={styles.featureTh}>{card.th}</Text>
                  <Text style={styles.featureEn}>{card.en}</Text>
                  <View style={styles.activeBadge}>
                    <Text style={styles.activeBadgeText}>เปิดใช้งาน</Text>
                  </View>
                </Pressable>
              );
            }
            return (
              <View key={card.key} style={styles.featureCard}>
                <Text style={styles.featureIcon}>{card.icon}</Text>
                <Text style={styles.featureTh}>{card.th}</Text>
                <Text style={styles.featureEn}>{card.en}</Text>
                <View style={styles.comingSoonBadge}>
                  <Text style={styles.comingSoonText}>เร็วๆ นี้</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Refresh button ───────────────────────────────────────────── */}
        <Pressable
          style={({ pressed }) => [styles.refreshBtn, pressed && styles.pressed, isRefreshing && styles.disabled]}
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
    paddingBottom: 32,
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
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1a56db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  profileInfo: {
    flex: 1,
    gap: 3,
  },
  profileEmail: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  profileRole: {
    fontSize: 12,
    color: '#6b7280',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
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
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
    marginVertical: 2,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 13,
    color: '#6b7280',
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111827',
  },

  // Section title
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
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
  featureCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    width: '47%',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  featureCardActive: {
    borderWidth: 1.5,
    borderColor: '#1a56db',
  },
  featureIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  featureTh: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  featureEn: {
    fontSize: 12,
    color: '#6b7280',
  },
  comingSoonBadge: {
    marginTop: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  comingSoonText: {
    fontSize: 11,
    color: '#1a56db',
    fontWeight: '500',
  },
  activeBadge: {
    marginTop: 8,
    backgroundColor: '#dcfce7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  activeBadgeText: {
    fontSize: 11,
    color: '#16a34a',
    fontWeight: '600',
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
