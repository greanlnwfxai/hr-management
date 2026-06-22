import { useEffect, useState } from 'react';
import {
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
import { useAttendance } from '../src/hooks/useAttendance';
import type { AttendanceRecord, AttendanceStatus } from '../src/api/types';
import { MobileBottomNav, MobileScreenHeader } from '../src/components';

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

function statusLabel(status: AttendanceStatus): string {
  if (status === 'PRESENT') return 'มาทำงาน';
  if (status === 'LATE') return 'มาสาย';
  return 'ขาดงาน';
}

function statusBg(status: AttendanceStatus): string {
  if (status === 'PRESENT') return '#dcfce7';
  if (status === 'LATE') return '#fef3c7';
  return '#fee2e2';
}

function statusFg(status: AttendanceStatus): string {
  if (status === 'PRESENT') return '#15803d';
  if (status === 'LATE') return '#b45309';
  return '#b91c1c';
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

  const [selectedDay, setSelectedDay] = useState<number>(todayDate);

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

  // Map attendance records to day → status
  const dotMap = new Map<number, string>();
  const recordMap = new Map<number, AttendanceRecord>();
  for (const rec of history) {
    const d = new Date(rec.date);
    if (d.getMonth() === month && d.getFullYear() === year) {
      dotMap.set(d.getDate(), dotColor(rec.status));
      recordMap.set(d.getDate(), rec);
    }
  }
  if (today) {
    recordMap.set(todayDate, today);
    dotMap.set(todayDate, dotColor(today.status));
  }

  const selectedRecord = recordMap.get(selectedDay) ?? null;
  const selectedDow = new Date(year, month, selectedDay).getDay();
  const isSelectedWeekend = selectedDow === 0 || selectedDow === 6;
  const isRefreshing = loadState === 'loading';

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <MobileScreenHeader
        title="ปฏิทิน"
        subtitle={`ภาพรวมเดือน ${THAI_MONTH_ABBR[month]} ${yearBE}`}
        backHref="/home"
      />
      {/* Tab header */}
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
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#3b82f6" />
        }
      >
        {/* Month header */}
        <View style={styles.monthHeader}>
          <View style={styles.monthHeaderLeft}>
            <Text style={styles.monthTitle}>
              {THAI_MONTH_ABBR[month]} {yearBE}
            </Text>
          </View>
        </View>

        {/* Day names */}
        <View style={styles.dayNamesRow}>
          {THAI_DAY_NAMES.map((d) => (
            <View key={d} style={styles.dayNameCell}>
              <Text style={styles.dayName}>{d}</Text>
            </View>
          ))}
        </View>

        {/* Calendar grid */}
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((day, di) => {
              const isToday = day === todayDate;
              const isSelected = day === selectedDay && !isToday;
              const isWeekendCell = di === 0 || di === 6;
              const dot = day ? dotMap.get(day) : undefined;
              return (
                <Pressable
                  key={di}
                  style={styles.calCell}
                  onPress={() => { if (day !== null) setSelectedDay(day); }}
                  disabled={day === null}
                >
                  <View
                    style={[
                      styles.calDayCircle,
                      isWeekendCell && styles.calDayCircleWeekend,
                      isSelected && styles.calDayCircleSelected,
                      isToday && styles.calDayCircleToday,
                    ]}
                  >
                    <Text
                      style={[
                        styles.calDayText,
                        isWeekendCell && styles.calDayTextWeekend,
                        isSelected && styles.calDayTextSelected,
                        isToday && styles.calDayTextToday,
                      ]}
                    >
                      {day !== null ? String(day) : ''}
                    </Text>
                  </View>
                  {dot ? (
                    <View style={[styles.calDot, { backgroundColor: dot }]} />
                  ) : (
                    <View style={styles.calDotSpace} />
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}

        {/* Detail section */}
        <View style={styles.contentSection}>
          {/* Selected day detail card */}
          <Pressable
            style={({ pressed }) => [styles.dayDetailCard, pressed && { opacity: 0.85 }]}
            onPress={() => {
              if (!selectedRecord) return;
              const dateStr = selectedRecord.date.slice(0, 10);
              router.push({ pathname: '/attendance-detail', params: { date: dateStr } });
            }}
            accessibilityRole="button"
            accessibilityLabel="ดูรายละเอียดการลงเวลา"
          >
            {/* Card header */}
            <View style={styles.cardHeader}>
              <View>
                <Text style={styles.cardHeaderDate}>
                  {selectedDay} {THAI_MONTH_ABBR[month]} {yearBE}
                </Text>
                <Text style={styles.cardHeaderDay}>
                  {selectedDay === todayDate ? 'วันนี้' : THAI_DAY_NAMES[selectedDow]}
                  {' · '}
                  {isSelectedWeekend ? 'วันหยุดสุดสัปดาห์' : 'วันทำงาน'}
                </Text>
              </View>
              {selectedRecord && (
                <View style={[styles.statusBadge, { backgroundColor: statusBg(selectedRecord.status) }]}>
                  <Text style={[styles.statusBadgeText, { color: statusFg(selectedRecord.status) }]}>
                    {statusLabel(selectedRecord.status)}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.cardDivider} />

            {/* Card body */}
            {isSelectedWeekend && !selectedRecord ? (
              <View style={styles.cardEmpty}>
                <Text style={styles.cardEmptyText}>ไม่มีข้อมูลการลงเวลา</Text>
              </View>
            ) : selectedRecord ? (
              <View style={styles.cardBody}>
                <View style={styles.timeRow}>
                  <View style={[styles.timeAccent, { backgroundColor: '#3b82f6' }]} />
                  <View style={styles.timeInfo}>
                    <Text style={styles.timeLabel}>เวลาเข้างาน</Text>
                    <Text style={styles.timeValue}>{formatTime(selectedRecord.checkIn)}</Text>
                  </View>
                </View>
                <View style={styles.timeRow}>
                  <View style={[styles.timeAccent, { backgroundColor: '#f59e0b' }]} />
                  <View style={styles.timeInfo}>
                    <Text style={styles.timeLabel}>เวลาออกงาน</Text>
                    <Text style={styles.timeValue}>{formatTime(selectedRecord.checkOut)}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.cardEmpty}>
                <Text style={styles.cardEmptyText}>ไม่มีข้อมูลการลงเวลา</Text>
              </View>
            )}
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
      <MobileBottomNav />
    </SafeAreaView>
  );
}

const CAL_BG = '#3b82f6';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8f9fa' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 24 },

  // Tab header
  tabHeader: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    backgroundColor: CAL_BG,
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
    paddingBottom: 18,
    backgroundColor: CAL_BG,
  },
  monthHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  monthTitle: { fontSize: 20, fontWeight: '700', color: '#ffffff' },

  // Day names row
  dayNamesRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingBottom: 8,
    backgroundColor: CAL_BG,
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
    paddingHorizontal: 10,
    backgroundColor: CAL_BG,
  },
  calCell: { flex: 1, alignItems: 'center', paddingVertical: 7 },
  calDayCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calDayCircleWeekend: { backgroundColor: 'rgba(255,255,255,0.06)' },
  calDayCircleSelected: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  calDayCircleToday: {
    backgroundColor: '#ffffff',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  calDayText: { fontSize: 14, color: '#ffffff', fontWeight: '400' },
  calDayTextWeekend: { color: '#dbeafe' },
  calDayTextSelected: { color: '#ffffff', fontWeight: '700' },
  calDayTextToday: { fontWeight: '800', fontSize: 15, color: CAL_BG },
  calDot: { width: 6, height: 6, borderRadius: 3, marginTop: 4, opacity: 0.9 },
  calDotSpace: { width: 6, height: 6, marginTop: 4 },

  // White content below calendar
  contentSection: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: 16,
    padding: 20,
    gap: 16,
    minHeight: 320,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },

  // Day detail card
  dayDetailCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
  },
  cardHeaderDate: { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardHeaderDay: { fontSize: 12, color: '#6b7280', marginTop: 3 },
  cardDivider: { height: 1, backgroundColor: '#f3f4f6' },
  cardBody: { padding: 16, gap: 14 },
  cardEmpty: { paddingVertical: 20, alignItems: 'center' },
  cardEmptyText: { fontSize: 13, color: '#9ca3af' },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeAccent: { width: 4, height: 36, borderRadius: 2 },
  timeInfo: { flex: 1 },
  timeLabel: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },
  timeValue: { fontSize: 17, fontWeight: '700', color: '#111827', marginTop: 2 },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusBadgeText: { fontSize: 13, fontWeight: '600' },

  // Empty requests
  emptyRequest: {
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#f9fafb',
  },
  emptyRequestText: { fontSize: 13, color: '#9ca3af' },
});
