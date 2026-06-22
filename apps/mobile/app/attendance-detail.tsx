import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/useAuth';
import { useAttendance } from '../src/hooks/useAttendance';
import type { AttendanceRecord } from '../src/api/types';

const THAI_DAY_ABB = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const THAI_MONTH_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const THAI_MONTH_ABBR = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

const CAL_BG = '#3b82f6';
const WORK_START_MIN = 8 * 60;   // 08:00
const WORK_END_MIN   = 17 * 60;  // 17:00
const WORK_SPAN_MIN  = WORK_END_MIN - WORK_START_MIN;

function toMinutes(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export default function AttendanceDetailScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();
  const { today, history } = useAttendance();
  const { date: dateParam } = useLocalSearchParams<{ date: string }>();
  const [activeTab, setActiveTab] = useState<'records' | 'requests'>('records');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isLoading, isAuthenticated]);

  // Find record for this date
  const record: AttendanceRecord | null = (() => {
    if (!dateParam) return null;
    const prefix = dateParam.slice(0, 10);
    if (today && today.date.startsWith(prefix)) return today;
    return history.find(r => r.date.startsWith(prefix)) ?? null;
  })();

  const dateObj = dateParam ? new Date(dateParam) : new Date();
  const dow      = dateObj.getDay();
  const dayNum   = dateObj.getDate();
  const monthIdx = dateObj.getMonth();
  const year     = dateObj.getFullYear();
  const yearBE   = year + 543;
  const shortDate = `${dayNum} ${THAI_MONTH_ABBR[monthIdx]}`;

  const checkInTime  = formatTime(record?.checkIn);
  const checkOutTime = formatTime(record?.checkOut);

  // Check-in position on shift bar (0–1)
  const checkInMin = toMinutes(record?.checkIn);
  const checkInRatio = checkInMin !== null
    ? Math.max(0, Math.min(1, (checkInMin - WORK_START_MIN) / WORK_SPAN_MIN))
    : null;

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12} accessibilityRole="button">
          <Text style={styles.backIcon}>‹</Text>
        </Pressable>
        <Text style={styles.headerTitle}>รายละเอียดการลงเวลา</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Hero */}
      <View style={styles.hero}>
        {/* Shift timeline */}
        <View style={styles.shiftSection}>
          {/* Check-in bubble */}
          {record?.checkIn && (
            <View style={styles.checkInBubbleRow}>
              <Text style={styles.checkInLabel}>เข้างาน</Text>
              <View style={styles.checkInPill}>
                <Text style={styles.checkInPillText}>{checkInTime}</Text>
              </View>
            </View>
          )}
          {/* Shift bar */}
          <View style={styles.shiftBarWrapper}>
            <View style={styles.shiftLine} />
            {/* Check-in marker on bar */}
            {checkInRatio !== null && (
              <View style={[styles.checkInMarker, { left: `${checkInRatio * 100}%` as any }]} />
            )}
          </View>
          {/* Shift labels */}
          <View style={styles.shiftLabelRow}>
            <View style={styles.shiftLabelItem}>
              <View style={styles.shiftPill}><Text style={styles.shiftPillText}>08:00</Text></View>
              <Text style={styles.shiftLabelText}>เริ่มกะ</Text>
            </View>
            <View style={styles.shiftLabelItem}>
              <View style={styles.shiftPill}><Text style={styles.shiftPillText}>17:00</Text></View>
              <Text style={styles.shiftLabelText}>สิ้นสุดกะ</Text>
            </View>
          </View>
        </View>

        {/* Date label */}
        <View style={styles.heroDate}>
          <Text style={styles.heroDateType}>วันทำงาน</Text>
          <Text style={styles.heroDateFull}>
            {THAI_DAY_ABB[dow]} {dayNum} {THAI_MONTH_FULL[monthIdx]} {yearBE}
          </Text>
          {record && (
            <Text style={styles.heroEmployee}>
              {record.employee.firstName} {record.employee.lastName}
            </Text>
          )}
        </View>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        <Pressable style={styles.tabItem} onPress={() => setActiveTab('records')}>
          <Text style={[styles.tabText, activeTab === 'records' && styles.tabTextActive]}>
            ข้อมูลบันทึกเวลา
          </Text>
          {activeTab === 'records' && <View style={styles.tabUnderline} />}
        </Pressable>
        <Pressable style={styles.tabItem} onPress={() => setActiveTab('requests')}>
          <Text style={[styles.tabText, activeTab === 'requests' && styles.tabTextActive]}>
            คำขอ
          </Text>
          {activeTab === 'requests' && <View style={styles.tabUnderline} />}
        </Pressable>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {activeTab === 'records' ? (
          <View style={styles.eventList}>
            {record?.checkIn && (
              <View style={styles.eventRow}>
                {/* Time badge */}
                <View style={styles.timeBadge}>
                  <Text style={styles.timeBadgeTime}>{checkInTime}</Text>
                  <Text style={styles.timeBadgeDate}>{shortDate}</Text>
                </View>

                {/* Track */}
                <View style={styles.track}>
                  <View style={styles.trackDot} />
                  {record?.checkOut && <View style={styles.trackLine} />}
                </View>

                {/* Card */}
                <View style={styles.eventCard}>
                  <Text style={styles.eventCardTitle}>บันทึกเข้างาน</Text>
                  <View style={styles.eventCardDivider} />
                  <Text style={styles.eventCardSub}>ผ่านมือถือ</Text>
                </View>
              </View>
            )}

            {record?.checkOut && (
              <View style={styles.eventRow}>
                <View style={styles.timeBadge}>
                  <Text style={styles.timeBadgeTime}>{checkOutTime}</Text>
                  <Text style={styles.timeBadgeDate}>{shortDate}</Text>
                </View>
                <View style={styles.track}>
                  <View style={styles.trackDot} />
                </View>
                <View style={styles.eventCard}>
                  <Text style={styles.eventCardTitle}>บันทึกออกงาน</Text>
                  <View style={styles.eventCardDivider} />
                  <Text style={styles.eventCardSub}>ผ่านมือถือ</Text>
                </View>
              </View>
            )}

            {!record && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>ไม่มีข้อมูลการลงเวลา</Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>ไม่มีรายการคำขอ</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CAL_BG },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: CAL_BG,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  backIcon: { fontSize: 28, color: '#ffffff', lineHeight: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#ffffff' },

  // Hero
  hero: {
    backgroundColor: CAL_BG,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 16,
  },

  // Shift timeline
  shiftSection: { gap: 8 },
  checkInBubbleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkInLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  checkInPill: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  checkInPillText: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
  shiftBarWrapper: {
    height: 20,
    justifyContent: 'center',
    position: 'relative',
  },
  shiftLine: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 2,
  },
  checkInMarker: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ffffff',
    top: 5,
    marginLeft: -5,
  },
  shiftLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  shiftLabelItem: { alignItems: 'center', gap: 4 },
  shiftPill: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  shiftPillText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  shiftLabelText: { fontSize: 11, color: 'rgba(255,255,255,0.65)' },

  // Hero date
  heroDate: { gap: 4 },
  heroDateType: { fontSize: 22, fontWeight: '700', color: '#ffffff' },
  heroDateFull: { fontSize: 22, fontWeight: '700', color: '#ffffff' },
  heroEmployee: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  tabText: { fontSize: 14, fontWeight: '500', color: '#9ca3af' },
  tabTextActive: { color: CAL_BG, fontWeight: '700' },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    height: 2,
    width: 80,
    backgroundColor: CAL_BG,
    borderRadius: 1,
  },

  // Scroll
  scroll: { flex: 1, backgroundColor: '#f3f4f6' },
  scrollContent: { padding: 16, paddingBottom: 40 },

  // Event timeline list
  eventList: { gap: 0 },
  eventRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 0,
  },

  // Time badge
  timeBadge: {
    width: 68,
    backgroundColor: CAL_BG,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  timeBadgeTime: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  timeBadgeDate: { fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 2 },

  // Track
  track: {
    width: 20,
    alignItems: 'center',
    paddingTop: 16,
  },
  trackDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: CAL_BG,
    zIndex: 1,
  },
  trackLine: {
    flex: 1,
    width: 2,
    backgroundColor: CAL_BG,
    marginTop: 4,
    marginBottom: -16,
    opacity: 0.4,
  },

  // Event card
  eventCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
    gap: 8,
  },
  eventCardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  eventCardDivider: { height: 1, backgroundColor: '#f3f4f6' },
  eventCardSub: { fontSize: 13, color: '#6b7280' },

  // Empty
  emptyState: { paddingVertical: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, color: '#9ca3af' },
});
