import { useEffect } from 'react';
import {
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
import { useAttendance } from '../src/hooks/useAttendance';
import type { AttendanceStatus } from '../src/api/types';

const THAI_DAY_NAMES = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const THAI_MONTH_ABBR = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function dotColor(status: AttendanceStatus): string {
  if (status === 'PRESENT') return '#22c55e';
  if (status === 'LATE') return '#f59e0b';
  return '#ef4444';
}

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

export default function CalendarScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { loadState, today, history, refresh } = useAttendance();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isLoading, isAuthenticated]);

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const yearBE = year + 543;
  const todayDate = now.getDate();
  const todayDow = now.getDay();

  // Build calendar weeks
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const allDays: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) allDays.push(null);
  for (let d = 1; d <= daysInMonth; d++) allDays.push(d);
  while (allDays.length % 7 !== 0) allDays.push(null);

  const weeks: (number | null)[][] = [];
  for (let i = 0; i < allDays.length; i += 7) {
    weeks.push(allDays.slice(i, i + 7));
  }

  // Map attendance records to day → status color
  const dotMap = new Map<number, string>();
  for (const rec of history) {
    const d = new Date(rec.date);
    if (d.getMonth() === month && d.getFullYear() === year) {
      dotMap.set(d.getDate(), dotColor(rec.status));
    }
  }

  const isWeekend = todayDow === 0 || todayDow === 6;
  const isRefreshing = loadState === 'loading';

  return (
    <SafeAreaView style={styles.root}>
      {/* ── Tab header ─────────────────────────────────────────────── */}
      <View style={styles.tabHeader}>
        <View style={styles.tabActive}>
          <Text style={styles.tabTextActive}>ปฏิทิน</Text>
          <View style={styles.tabUnderline} />
        </View>
        <View style={styles.tab}>
          <Text style={styles.tabText}>ปฏิทินทีม</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#1a56db" />
        }
      >
        {/* ── Month header ────────────────────────────────────────────── */}
        <View style={styles.monthHeader}>
          <View style={styles.monthHeaderLeft}>
            <Text style={styles.monthIcon}>📅</Text>
            <Text style={styles.monthTitle}>
              {THAI_MONTH_ABBR[month]} {yearBE}
            </Text>
            <Text style={styles.monthChevron}>∨</Text>
          </View>
          <Text style={styles.filterIcon}>☰</Text>
        </View>

        {/* ── Day names ───────────────────────────────────────────────── */}
        <View style={styles.dayNamesRow}>
          {THAI_DAY_NAMES.map((d) => (
            <View key={d} style={styles.dayNameCell}>
              <Text style={styles.dayName}>{d}</Text>
            </View>
          ))}
        </View>

        {/* ── Calendar grid ───────────────────────────────────────────── */}
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((day, di) => {
              const isToday = day === todayDate;
              const dot = day ? dotMap.get(day) : undefined;
              return (
                <View key={di} style={styles.calCell}>
                  <View style={[styles.calDayCircle, isToday && styles.calDayCircleToday]}>
                    <Text style={[styles.calDayText, isToday && styles.calDayTextToday]}>
                      {day !== null ? String(day) : ''}
                    </Text>
                  </View>
                  {dot ? (
                    <View style={[styles.calDot, { backgroundColor: dot }]} />
                  ) : (
                    <View style={styles.calDotSpace} />
                  )}
                </View>
              );
            })}
          </View>
        ))}

        {/* ── White content section ───────────────────────────────────── */}
        <View style={styles.contentSection}>
          {/* Schedule */}
          <Text style={styles.sectionTitle}>ตารางการทำงาน</Text>
          <Pressable
            style={({ pressed }) => [styles.scheduleCard, pressed && { opacity: 0.82 }]}
            onPress={() => router.push('/attendance')}
            accessibilityRole="button"
            accessibilityLabel="ดูรายละเอียดการลงเวลา"
          >
            <View style={styles.scheduleLeft}>
              <Text style={styles.scheduleDayNum}>{todayDate}</Text>
              <Text style={styles.scheduleDayShort}>{THAI_DAY_NAMES[todayDow]}</Text>
            </View>
            <View style={styles.scheduleBody}>
              <Text style={styles.scheduleDayType}>
                {isWeekend ? 'วันหยุดประจำรอบ' : 'วันทำงาน'}
              </Text>
              <Text style={styles.scheduleTime}>08:30-17:30</Text>
              <Text style={styles.scheduleStatus}>
                {`เข้า ${formatTime(today?.checkIn)}  ออก ${formatTime(today?.checkOut)}`}
              </Text>
            </View>
            <Text style={styles.scheduleArrow}>›</Text>
          </Pressable>

          {/* Leave requests */}
          <Text style={styles.sectionTitle}>รายการคำขอ</Text>
          <Pressable
            style={styles.emptyRequest}
            onPress={() => router.push('/leave')}
            accessibilityRole="button"
          >
            <Text style={styles.emptyRequestText}>ไม่มีรายการคำขอ</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a56db' },
  scroll: { flex: 1 },

  // Tab header
  tabHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
  },
  tabActive: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
  },
  tabText: { fontSize: 15, color: 'rgba(255,255,255,0.55)', fontWeight: '500' },
  tabTextActive: { fontSize: 15, color: '#ffffff', fontWeight: '700' },
  tabUnderline: {
    height: 2,
    width: 40,
    backgroundColor: '#ffffff',
    borderRadius: 1,
  },

  // Month header
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  monthHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthIcon: { fontSize: 20 },
  monthTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },
  monthChevron: { fontSize: 14, color: '#e0e7ff', fontWeight: '700' },
  filterIcon: { fontSize: 18, color: '#ffffff' },

  // Day names row
  dayNamesRow: {
    flexDirection: 'row',
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  dayNameCell: { flex: 1, alignItems: 'center' },
  dayName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
    paddingVertical: 4,
  },

  // Calendar grid
  weekRow: {
    flexDirection: 'row',
    paddingHorizontal: 4,
  },
  calCell: { flex: 1, alignItems: 'center', paddingVertical: 5 },
  calDayCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calDayCircleToday: { backgroundColor: '#ffffff' },
  calDayText: { fontSize: 14, color: '#ffffff', fontWeight: '400' },
  calDayTextToday: { fontWeight: '800', fontSize: 15, color: '#1a56db' },
  calDot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },
  calDotSpace: { width: 6, height: 6, marginTop: 2 },

  // White content below calendar
  contentSection: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 16,
    padding: 20,
    gap: 14,
    minHeight: 320,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },

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
  scheduleBody: { flex: 1, gap: 4 },
  scheduleDayType: { fontSize: 14, fontWeight: '600', color: '#111827' },
  scheduleTime: { fontSize: 13, color: '#6b7280' },
  scheduleStatus: { fontSize: 12, color: '#9ca3af' },
  scheduleArrow: { fontSize: 22, color: '#9ca3af' },

  // Empty requests
  emptyRequest: { paddingVertical: 12, alignItems: 'center' },
  emptyRequestText: { fontSize: 13, color: '#9ca3af' },
});
