import React, { useEffect, useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/useAuth';
import { useDashboard } from '../src/hooks/useDashboard';
import { useAttendance } from '../src/hooks/useAttendance';
import { roleLabel } from '../src/utils/roles';
import { MobileBottomNav } from '../src/components';

const THAI_DAY_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

function formatTimeStr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function formatHours(totalMinutes: number): string {
  const abs = Math.max(0, Math.round(totalMinutes));
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function countWorkingDays(year: number, month: number, upTo: number): number {
  let n = 0;
  for (let d = 1; d <= upTo; d++) {
    const dow = new Date(year, month, d).getDay();
    if (dow !== 0 && dow !== 6) n++;
  }
  return n;
}

function TodayScheduleCard({
  onPress,
  checkIn,
  checkOut,
}: {
  onPress: () => void;
  checkIn?: string | null;
  checkOut?: string | null;
}) {
  const now = new Date();
  const day = now.getDate();
  const dow = now.getDay();
  const isWeekend = dow === 0 || dow === 6;
  return (
    <Pressable
      style={({ pressed }) => [styles.scheduleCard, pressed && { opacity: 0.82 }]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.scheduleLeft}>
        <Text style={styles.scheduleDayNum}>{day}</Text>
        <Text style={styles.scheduleDayShort}>{THAI_DAY_SHORT[dow]}</Text>
      </View>
      <View style={styles.scheduleBody}>
        <Text style={styles.scheduleDayType}>
          {isWeekend ? 'วันหยุดประจำรอบ' : 'วันทำงาน'}
        </Text>
        <Text style={styles.scheduleTime}>08:30–17:30</Text>
        <Text style={styles.scheduleStatus}>
          {`เข้า ${formatTimeStr(checkIn)}  ออก ${formatTimeStr(checkOut)}`}
        </Text>
      </View>
      <Text style={styles.scheduleArrow}>›</Text>
    </Pressable>
  );
}

function DonutRing({ pct, color, size = 72 }: { pct: number; color: string; size?: number }) {
  const safe = Math.min(100, Math.max(0, Math.round(pct)));
  if (Platform.OS === 'web') {
    return React.createElement(
      'div',
      {
        style: {
          width: size,
          height: size,
          minWidth: size,
          borderRadius: '50%',
          background:
            safe > 0
              ? `conic-gradient(${color} ${safe}%, #e5e7eb ${safe}%)`
              : '#e5e7eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        },
      },
      React.createElement('div', {
        style: {
          width: size * 0.65,
          height: size * 0.65,
          borderRadius: '50%',
          backgroundColor: '#fff',
        },
      }),
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: Math.max(5, Math.round(size * 0.11)),
        borderColor: safe > 0 ? color : '#e5e7eb',
      }}
    />
  );
}

function AttendanceStatCard({
  label,
  valueMinutes,
  totalMinutes,
  color,
}: {
  label: string;
  valueMinutes: number;
  totalMinutes: number;
  color: string;
}) {
  const pct = totalMinutes > 0 ? Math.min(100, (valueMinutes / totalMinutes) * 100) : 0;
  const totalHoursInt = Math.floor(totalMinutes / 60);
  return (
    <View style={styles.statCard}>
      <DonutRing pct={pct} color={color} size={72} />
      <View style={styles.statCardText}>
        <Text style={styles.statCardLabel}>{label}</Text>
        <Text style={styles.statCardValue}>
          {formatHours(valueMinutes)}{' '}
          <Text style={styles.statCardUnit}>ชั่วโมง</Text>
        </Text>
        <Text style={styles.statCardSub}>จากทั้งหมด {totalHoursInt} ชั่วโมง</Text>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, signOut } = useAuth();
  const { profile, refresh: dashRefresh } = useDashboard();
  const { loadState, today, history, refresh: attRefresh } = useAttendance();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isLoading, isAuthenticated]);

  const handleLogout = async () => {
    await signOut();
    router.replace('/login');
  };

  const refresh = () => {
    dashRefresh();
    attRefresh();
  };
  const isRefreshing = loadState === 'loading';
  const forced = !!(profile?.mustChangePassword ?? user?.mustChangePassword);

  const displayUser = profile ?? user;
  const employeeName = profile?.employee
    ? `${profile.employee.firstName} ${profile.employee.lastName}`
    : null;
  const displayName =
    employeeName ?? profile?.username ?? displayUser?.email?.split('@')[0] ?? '';
  const avatarLetter = (
    employeeName ?? profile?.username ?? displayUser?.email ?? '?'
  )
    .charAt(0)
    .toUpperCase();
  const department = profile?.employee?.department ?? null;
  const position = profile?.employee?.position ?? null;
  const role = displayUser?.role ?? '';
  const identityLine = [profile?.username ? `@${profile.username}` : null, roleLabel(role), department]
    .filter(Boolean)
    .join(' · ');

  // Monthly attendance stats computed from history
  const stats = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const todayDate = now.getDate();
    const wDays = countWorkingDays(year, month, todayDate);
    const totalMinutes = wDays * 8 * 60;

    const thisMonth = history.filter((r) => {
      const d = new Date(r.date);
      return d.getMonth() === month && d.getFullYear() === year;
    });

    let workMinutes = 0;
    let lateMinutes = 0;
    let earlyOutMinutes = 0;
    let absentMinutes = 0;

    for (const r of thisMonth) {
      if (r.checkIn && r.checkOut) {
        workMinutes += Math.max(
          0,
          (new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 60000,
        );
      }
      if (r.status === 'LATE' && r.checkIn) {
        const d = new Date(r.checkIn);
        const scheduled = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 30);
        lateMinutes += Math.max(0, (d.getTime() - scheduled.getTime()) / 60000);
      }
      if (r.checkOut) {
        const d = new Date(r.checkOut);
        const scheduled = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 17, 30);
        const diff = scheduled.getTime() - d.getTime();
        if (diff > 0) earlyOutMinutes += diff / 60000;
      }
      if (r.status === 'ABSENT') absentMinutes += 480;
    }

    return { totalMinutes, workMinutes, lateMinutes, earlyOutMinutes, absentMinutes };
  }, [history]);

  if (isLoading) {
    return (
      <View style={styles.fullCenter}>
        <ActivityIndicator color="#ffffff" size="large" />
      </View>
    );
  }

  const quickLinks = [
    { label: 'Attendance', subtitle: 'ลงเวลาและดูประวัติ', href: '/attendance' as const },
    { label: 'Leave', subtitle: 'ส่งคำขอและติดตามผล', href: '/leave' as const },
    { label: 'Calendar', subtitle: 'ตารางงานประจำเดือน', href: '/calendar' as const },
    { label: 'Profile', subtitle: 'ข้อมูลบัญชีและรหัสผ่าน', href: '/profile' as const },
  ];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* ── Hero Header ─────────────────────────────────────────────── */}
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <Text style={styles.heroAppName}>HR Mobile</Text>
          <Pressable
            style={({ pressed }) => [styles.heroLogoutBtn, pressed && { opacity: 0.7 }]}
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="ออกจากระบบ"
          >
            <Text style={styles.heroLogoutText}>ออกจากระบบ</Text>
          </Pressable>
        </View>

        {displayUser && (
          <View style={styles.heroProfileRow}>
            <View style={styles.heroAvatar}>
              <Text style={styles.heroAvatarText}>{avatarLetter}</Text>
            </View>
            <View style={styles.heroProfileInfo}>
              <Text style={styles.heroEyebrow}>Employee Self Service</Text>
              <Text style={styles.heroName} numberOfLines={1}>
                {displayName || 'ผู้ใช้'}
              </Text>
              {identityLine ? (
                <Text style={styles.heroSubtitle} numberOfLines={1}>
                  {identityLine}
                </Text>
              ) : null}
              {position ? (
                <View style={styles.heroRoleBadge}>
                  <Text style={styles.heroRoleText}>{position}</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}

        <View style={styles.heroActionRow}>
          <Pressable
            style={({ pressed }) => [
              styles.heroCheckInBtn,
              (forced || !displayUser) && styles.heroActionDisabled,
              pressed && !forced && { opacity: 0.85 },
            ]}
            onPress={() => !forced && router.push('/attendance')}
            accessibilityRole="button"
            accessibilityLabel="เช็คอิน"
          >
            <Text style={styles.heroActionIcon}>▶</Text>
            <Text style={styles.heroActionBtnText}>เช็คอิน</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.heroCheckOutBtn,
              (forced || !displayUser) && styles.heroActionDisabled,
              pressed && !forced && { opacity: 0.85 },
            ]}
            onPress={() => !forced && router.push('/attendance')}
            accessibilityRole="button"
            accessibilityLabel="เช็คเอาท์"
          >
            <Text style={styles.heroActionIcon}>◀</Text>
            <Text style={styles.heroActionBtnText}>เช็คเอาท์</Text>
          </Pressable>
        </View>
      </View>

      {/* ── Scrollable Content ───────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#1a56db" />
        }
      >
        {/* mustChangePassword banner */}
        {forced && (
          <Pressable
            style={styles.mustChangeBanner}
            onPress={() => router.push('/profile')}
            accessibilityRole="button"
            accessibilityLabel="เปลี่ยนรหัสผ่าน"
          >
            <Text style={styles.mustChangeBannerTitle}>⚠️ กรุณาเปลี่ยนรหัสผ่าน</Text>
            <Text style={styles.mustChangeBannerText}>
              บัญชีของคุณต้องเปลี่ยนรหัสผ่านก่อนใช้งาน แตะที่นี่เพื่อเปลี่ยนรหัสผ่าน →
            </Text>
          </Pressable>
        )}

        {!forced && (
          <>
            <View style={styles.quickLinksSection}>
              {quickLinks.map((link) => (
                <Pressable
                  key={link.href}
                  style={({ pressed }) => [styles.quickLinkCard, pressed && styles.pressed]}
                  onPress={() => router.push(link.href)}
                  accessibilityRole="button"
                >
                  <Text style={styles.quickLinkLabel}>{link.label}</Text>
                  <Text style={styles.quickLinkSubtitle}>{link.subtitle}</Text>
                </Pressable>
              ))}
            </View>

            {/* ── ปฏิทิน ──────────────────────────────────────────────── */}
            <View style={styles.calSectionHeader}>
              <View style={styles.calSectionLeft}>
                <Text style={styles.calSectionTitle}>ปฏิทิน</Text>
              </View>
              <Pressable
                onPress={() => router.push('/calendar')}
                accessibilityRole="button"
                accessibilityLabel="ดูปฏิทินทั้งหมด"
              >
                <Text style={styles.calSectionLink}>ดูทั้งหมด ›</Text>
              </Pressable>
            </View>
            <Text style={styles.calSubtitle}>ตารางการทำงาน</Text>
            <TodayScheduleCard
              onPress={() => router.push('/attendance')}
              checkIn={today?.checkIn}
              checkOut={today?.checkOut}
            />
            <Text style={styles.calSubtitle}>รายการคำขอ</Text>
            <Pressable
              onPress={() => router.push('/leave')}
              style={styles.requestPlaceholder}
              accessibilityRole="button"
            >
              <Text style={styles.requestPlaceholderText}>ไม่มีรายการคำขอ</Text>
            </Pressable>

            {/* ── แดชบอร์ด ─────────────────────────────────────────────── */}
            <View style={styles.dashSectionHeader}>
              <Text style={styles.dashSectionTitle}>แดชบอร์ด</Text>
            </View>
            <Text style={styles.dashSubtitle}>
              สรุปการเข้าทำงาน (เดือนนี้ - ปัจจุบัน)
            </Text>

            {/* ── Horizontal stat cards ────────────────────────────────── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cardScrollContent}
              style={styles.cardScrollView}
              decelerationRate="fast"
              snapToAlignment="start"
            >
              <AttendanceStatCard
                label="ปฏิบัติงาน"
                valueMinutes={stats.workMinutes}
                totalMinutes={stats.totalMinutes}
                color="#1a56db"
              />
              <AttendanceStatCard
                label="เข้าสาย"
                valueMinutes={stats.lateMinutes}
                totalMinutes={stats.totalMinutes}
                color="#f59e0b"
              />
              <AttendanceStatCard
                label="ออกก่อน"
                valueMinutes={stats.earlyOutMinutes}
                totalMinutes={stats.totalMinutes}
                color="#f59e0b"
              />
              <AttendanceStatCard
                label="ขาดงาน"
                valueMinutes={stats.absentMinutes}
                totalMinutes={stats.totalMinutes}
                color="#ef4444"
              />
              <AttendanceStatCard
                label="ลางาน"
                valueMinutes={0}
                totalMinutes={stats.totalMinutes}
                color="#1a56db"
              />
            </ScrollView>
          </>
        )}
      </ScrollView>
      <MobileBottomNav />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  fullCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0d1e4a',
  },

  // Root + hero
  root: { flex: 1, backgroundColor: '#0d1e4a' },
  hero: {
    backgroundColor: '#0d1e4a',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
    gap: 14,
  },

  // Hero top row
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroAppName: {
    fontSize: 21,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.3,
  },
  heroLogoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  heroLogoutText: { fontSize: 12, fontWeight: '600', color: '#ffffff' },

  // Hero profile
  heroProfileRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  heroAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroAvatarText: { color: '#ffffff', fontSize: 24, fontWeight: '700' },
  heroProfileInfo: { flex: 1, gap: 3 },
  heroEyebrow: { fontSize: 11, color: '#bfdbfe', fontWeight: '600', letterSpacing: 0.5 },
  heroName: { fontSize: 19, fontWeight: '700', color: '#ffffff' },
  heroSubtitle: { fontSize: 12, color: '#dbeafe', lineHeight: 17 },
  heroRoleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  heroRoleText: { fontSize: 11, fontWeight: '600', color: '#e0e7ff' },

  // Hero action buttons
  heroActionRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  heroCheckInBtn: {
    flexGrow: 1,
    flexBasis: 148,
    backgroundColor: '#1a56db',
    borderRadius: 100,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#1a56db',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  heroCheckOutBtn: {
    flexGrow: 1,
    flexBasis: 148,
    backgroundColor: '#e05c3e',
    borderRadius: 100,
    paddingVertical: 13,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#e05c3e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  heroActionDisabled: { opacity: 0.4 },
  heroActionIcon: { fontSize: 13, color: '#ffffff', fontWeight: '700' },
  heroActionBtnText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },

  // Scroll area
  scroll: { flex: 1, backgroundColor: '#f0f2f5' },
  scrollContent: { padding: 16, gap: 20, paddingBottom: 24 },

  quickLinksSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickLinkCard: {
    width: '48%',
    minWidth: 148,
    flexGrow: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  quickLinkLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  quickLinkSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },

  // mustChangePassword banner
  mustChangeBanner: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 14,
    gap: 4,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  mustChangeBannerTitle: { fontSize: 14, fontWeight: '700', color: '#92400e' },
  mustChangeBannerText: { fontSize: 13, color: '#78350f', lineHeight: 18 },

  // ปฏิทิน section
  calSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  calSectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  calSectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  calSectionLink: { fontSize: 14, fontWeight: '600', color: '#1a56db' },
  calSubtitle: { fontSize: 13, fontWeight: '500', color: '#374151', paddingHorizontal: 2, marginTop: -8 },

  // Schedule card
  scheduleCard: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  scheduleLeft: { alignItems: 'center', gap: 2, minWidth: 36 },
  scheduleDayNum: { fontSize: 26, fontWeight: '700', color: '#111827', lineHeight: 30 },
  scheduleDayShort: { fontSize: 12, color: '#6b7280' },
  scheduleBody: { flex: 1, gap: 3 },
  scheduleDayType: { fontSize: 14, fontWeight: '600', color: '#111827' },
  scheduleTime: { fontSize: 13, color: '#6b7280' },
  scheduleStatus: { fontSize: 12, color: '#9ca3af' },
  scheduleArrow: { fontSize: 22, color: '#9ca3af' },

  // Request placeholder
  requestPlaceholder: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  requestPlaceholderText: { fontSize: 13, color: '#9ca3af' },

  // แดชบอร์ด section header
  dashSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  dashSectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  dashSubtitle: { fontSize: 13, color: '#6b7280', paddingHorizontal: 2, marginTop: -10 },

  // Horizontal card scroller
  cardScrollView: { marginHorizontal: -16 },
  cardScrollContent: {
    paddingHorizontal: 16,
    gap: 12,
    paddingRight: 24,
    paddingBottom: 4,
  },

  // Individual stat card
  statCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    width: 164,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  statCardText: { flex: 1, gap: 3 },
  statCardLabel: { fontSize: 12, color: '#6b7280', fontWeight: '500' },
  statCardValue: { fontSize: 18, fontWeight: '700', color: '#111827', lineHeight: 24 },
  statCardUnit: { fontSize: 13, fontWeight: '600', color: '#111827' },
  statCardSub: { fontSize: 11, color: '#9ca3af', lineHeight: 16 },
  pressed: { opacity: 0.8 },
});
