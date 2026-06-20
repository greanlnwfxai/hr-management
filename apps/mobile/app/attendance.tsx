import { useEffect, useState } from 'react';
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
import { useAttendance } from '../src/hooks/useAttendance';
import type { AttendanceRecord, AttendanceStatus } from '../src/api/types';
import type { ClockActionState } from '../src/hooks/useAttendance';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const THAI_DAY_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const THAI_MONTH_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
const THAI_DAY_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];
const THAI_MONTH_ABBR = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${THAI_MONTH_ABBR[d.getMonth()]}`;
}

function statusLabel(status: AttendanceStatus): string {
  switch (status) {
    case 'PRESENT': return 'ตรงเวลา';
    case 'LATE': return 'สาย';
    case 'ABSENT': return 'ขาดงาน';
  }
}

function statusColor(status: AttendanceStatus): string {
  switch (status) {
    case 'PRESENT': return '#16a34a';
    case 'LATE': return '#d97706';
    case 'ABSENT': return '#dc2626';
  }
}

// ─── Timeline header ──────────────────────────────────────────────────────────

function AttendanceHeader({ today }: { today: AttendanceRecord | null }) {
  const now = new Date();
  const dow = now.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const dayType = isWeekend ? 'วันหยุด' : 'วันทำงาน';
  const fullDate = `${THAI_DAY_FULL[dow]} ${now.getDate()} ${THAI_MONTH_FULL[now.getMonth()]} ${now.getFullYear() + 543}`;

  const inTime = formatTime(today?.checkIn ?? null);
  const outTime = formatTime(today?.checkOut ?? null);
  const hasIn = Boolean(today?.checkIn);
  const hasOut = Boolean(today?.checkOut);

  return (
    <View style={hdr.container}>
      {/* Time timeline */}
      <View style={hdr.timeline}>
        {/* Labels row */}
        <View style={hdr.timelineLabels}>
          <Text style={hdr.timelineLabel}>เข้างาน</Text>
          <View style={hdr.timelineSpacer} />
          <Text style={hdr.timelineLabel}>ออกงาน</Text>
        </View>

        {/* Bubbles + line row */}
        <View style={hdr.timelineBubblesRow}>
          <View style={[hdr.timeBubble, !hasIn && hdr.timeBubbleEmpty]}>
            <Text style={hdr.timeBubbleText}>{inTime}</Text>
          </View>
          <View style={hdr.timelineLine} />
          <View style={[hdr.timeBubble, !hasOut && hdr.timeBubbleEmpty]}>
            <Text style={hdr.timeBubbleText}>{outTime}</Text>
          </View>
        </View>

        {/* Scheduled times */}
        <View style={hdr.scheduledRow}>
          <View style={hdr.scheduledItem}>
            <View style={hdr.scheduledBubble}>
              <Text style={hdr.scheduledBubbleText}>08:30</Text>
            </View>
            <Text style={hdr.scheduledLabel}>เริ่มกะ</Text>
          </View>
          <View style={hdr.timelineSpacer} />
          <View style={hdr.scheduledItem}>
            <View style={hdr.scheduledBubble}>
              <Text style={hdr.scheduledBubbleText}>17:30</Text>
            </View>
            <Text style={hdr.scheduledLabel}>สิ้นสุดกะ</Text>
          </View>
        </View>
      </View>

      {/* Day type + date */}
      <Text style={hdr.dayType}>{dayType}</Text>
      <Text style={hdr.fullDate}>{fullDate}</Text>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function clockInLabel(state: ClockActionState): string {
  if (state === 'locating') return 'กำลังตรวจสอบตำแหน่ง...';
  if (state === 'submitting') return 'กำลังเช็คอิน...';
  return 'เช็คอิน';
}

function clockOutLabel(state: ClockActionState): string {
  if (state === 'locating') return 'กำลังตรวจสอบตำแหน่ง...';
  if (state === 'submitting') return 'กำลังเช็คเอาท์...';
  return 'เช็คเอาท์';
}

interface ClockActionCardProps {
  today: AttendanceRecord | null;
  dataLoading: boolean;
  clockInState: ClockActionState;
  clockOutState: ClockActionState;
  actionError: string | null;
  actionMessage: string | null;
  onClockIn: () => void;
  onClockOut: () => void;
}

function ClockActionCard({
  today,
  dataLoading,
  clockInState,
  clockOutState,
  actionError,
  actionMessage,
  onClockIn,
  onClockOut,
}: ClockActionCardProps) {
  const inBusy = clockInState === 'locating' || clockInState === 'submitting';
  const outBusy = clockOutState === 'locating' || clockOutState === 'submitting';
  const alreadyClockedIn = Boolean(today?.checkIn);
  const alreadyClockedOut = Boolean(today?.checkOut);
  const inDisabled = dataLoading || inBusy || outBusy || alreadyClockedIn;
  const outDisabled = dataLoading || inBusy || outBusy || !alreadyClockedIn || alreadyClockedOut;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>ลงเวลา</Text>
      <View style={styles.clockRow}>
        <Pressable
          style={({ pressed }) => [
            styles.clockBtn,
            inDisabled ? styles.clockBtnDisabled : styles.clockBtnIn,
            pressed && !inDisabled && styles.pressed,
          ]}
          onPress={onClockIn}
          disabled={inDisabled}
          accessibilityRole="button"
          accessibilityLabel="เช็คอิน"
        >
          {inBusy ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.clockBtnIcon}>▶</Text>
          )}
          <Text style={[styles.clockBtnLabel, !inDisabled && styles.clockBtnLabelActive]}>
            {clockInLabel(clockInState)}
          </Text>
          {alreadyClockedIn && !inBusy && (
            <Text style={styles.clockBtnSub}>เช็คอินแล้ว</Text>
          )}
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.clockBtn,
            outDisabled ? styles.clockBtnDisabled : styles.clockBtnOut,
            pressed && !outDisabled && styles.pressed,
          ]}
          onPress={onClockOut}
          disabled={outDisabled}
          accessibilityRole="button"
          accessibilityLabel="เช็คเอาท์"
        >
          {outBusy ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.clockBtnIcon}>◀</Text>
          )}
          <Text style={[styles.clockBtnLabel, !outDisabled && styles.clockBtnLabelActive]}>
            {clockOutLabel(clockOutState)}
          </Text>
          {alreadyClockedOut && !outBusy && (
            <Text style={styles.clockBtnSub}>เช็คเอาท์แล้ว</Text>
          )}
        </Pressable>
      </View>

      {actionError ? (
        <View style={styles.actionErrorBox}>
          <Text style={styles.actionErrorText}>{actionError}</Text>
        </View>
      ) : null}

      {actionMessage ? (
        <View style={styles.actionSuccessBox}>
          <Text style={styles.actionSuccessText}>{actionMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

function GeofenceNotice() {
  return (
    <View style={[styles.card, styles.noticeCard]}>
      <View style={styles.noticeRow}>
        <Text style={styles.noticeIcon}>📍</Text>
        <View style={styles.noticeTextBlock}>
          <Text style={styles.noticeTitle}>การตรวจสอบตำแหน่ง</Text>
          <Text style={styles.noticeBody}>
            การลงเวลาผ่านมือถือจะตรวจสอบว่าคุณอยู่ในรัศมีบริษัท 100 เมตร
          </Text>
        </View>
      </View>
    </View>
  );
}

function HistoryTimeline({ records }: { records: AttendanceRecord[] }) {
  if (records.length === 0) {
    return (
      <View style={styles.emptyHistory}>
        <Text style={styles.emptyHistoryText}>ไม่พบประวัติการลงเวลา</Text>
      </View>
    );
  }

  return (
    <View style={styles.timelineList}>
      {records.map((rec) => {
        const sc = statusColor(rec.status);
        return (
          <View key={rec.id} style={styles.timelineItem}>
            {/* Date tag */}
            <View style={[styles.dateTag, { backgroundColor: sc }]}>
              <Text style={styles.dateTagTime}>{formatTime(rec.checkIn)}</Text>
              <Text style={styles.dateTagDate}>{formatShortDate(rec.date)}</Text>
            </View>

            {/* Connector dot */}
            <View style={styles.timelineConnector}>
              <View style={[styles.timelineDot, { borderColor: sc }]} />
              <View style={styles.timelineVLine} />
            </View>

            {/* Record card */}
            <View style={styles.timelineCard}>
              <View style={styles.timelineCardHeader}>
                <Text style={styles.timelineCardTitle}>
                  {rec.checkIn ? 'บันทึกเข้างาน' : 'บันทึกขาดงาน'}
                </Text>
                <View style={[styles.statusBadge, { backgroundColor: sc + '20' }]}>
                  <Text style={[styles.statusBadgeText, { color: sc }]}>
                    {statusLabel(rec.status)}
                  </Text>
                </View>
              </View>
              <Text style={styles.timelineCardSub}>ผ่านมือถือ</Text>
              {rec.checkOut ? (
                <Text style={styles.timelineCardSub}>
                  ออกงาน: {formatTime(rec.checkOut)}
                </Text>
              ) : null}
              {rec.note ? (
                <Text style={styles.timelineCardNote} numberOfLines={2}>{rec.note}</Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function AttendanceScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const {
    loadState,
    today,
    history,
    error,
    refresh,
    clockInState,
    clockOutState,
    clockActionError,
    clockActionMessage,
    performClockIn,
    performClockOut,
  } = useAttendance();

  const [activeTab, setActiveTab] = useState<'time' | 'request'>('time');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (!isLoading && isAuthenticated && user?.mustChangePassword) {
      router.replace('/profile');
    }
  }, [isLoading, isAuthenticated, user?.mustChangePassword]);

  function formatUpdatedTime(date: Date | null): string {
    if (!date) return '—';
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }

  const isRefreshing = loadState === 'loading';

  return (
    <SafeAreaView style={styles.root}>
      {/* ── Attendance header (blue) ─────────────────────────────────── */}
      <AttendanceHeader today={today} />

      {/* ── Tab bar ─────────────────────────────────────────────────── */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabBtn, activeTab === 'time' && styles.tabBtnActive]}
          onPress={() => setActiveTab('time')}
          accessibilityRole="tab"
        >
          <Text style={[styles.tabBtnText, activeTab === 'time' && styles.tabBtnTextActive]}>
            บันทึกเวลา
          </Text>
          {activeTab === 'time' && <View style={styles.tabBtnUnderline} />}
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === 'request' && styles.tabBtnActive]}
          onPress={() => setActiveTab('request')}
          accessibilityRole="tab"
        >
          <Text style={[styles.tabBtnText, activeTab === 'request' && styles.tabBtnTextActive]}>
            คำขอ
          </Text>
          {activeTab === 'request' && <View style={styles.tabBtnUnderline} />}
        </Pressable>
      </View>

      {/* ── Content ────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#1a56db" />
        }
      >
        {activeTab === 'time' && (
          <>
            {/* Loading / error */}
            {loadState === 'loading' && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#1a56db" size="small" />
                <Text style={styles.loadingText}>กำลังโหลดข้อมูล</Text>
              </View>
            )}

            {loadState === 'error' && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error ?? 'ไม่สามารถโหลดข้อมูลได้'}</Text>
                <Pressable
                  style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
                  onPress={refresh}
                  accessibilityRole="button"
                >
                  <Text style={styles.retryText}>ลองใหม่อีกครั้ง</Text>
                </Pressable>
              </View>
            )}

            {/* Clock actions */}
            <ClockActionCard
              today={today}
              dataLoading={loadState === 'loading'}
              clockInState={clockInState}
              clockOutState={clockOutState}
              actionError={clockActionError}
              actionMessage={clockActionMessage}
              onClockIn={performClockIn}
              onClockOut={performClockOut}
            />

            {/* Geofence notice */}
            <GeofenceNotice />

            {/* History */}
            {loadState === 'success' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>ประวัติการลงเวลา</Text>
                <HistoryTimeline records={history} />
              </View>
            )}
          </>
        )}

        {activeTab === 'request' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>คำขอลา</Text>
            <Text style={styles.emptyHistoryText}>
              ดูและส่งคำขอลาได้ในหน้าการลา
            </Text>
            <Pressable
              style={({ pressed }) => [styles.goLeaveBtn, pressed && styles.pressed]}
              onPress={() => router.push('/leave')}
              accessibilityRole="button"
            >
              <Text style={styles.goLeaveBtnText}>ไปหน้าการลา →</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const hdr = StyleSheet.create({
  container: {
    backgroundColor: '#1a56db',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 10,
  },
  timeline: { gap: 8 },
  timelineLabels: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timelineLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '500',
  },
  timelineSpacer: { flex: 1 },
  timelineBubblesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeBubble: {
    backgroundColor: '#1e3a8a',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  timeBubbleEmpty: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  timeBubbleText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  timelineLine: {
    flex: 1,
    height: 2,
    backgroundColor: '#bfdbfe',
    marginHorizontal: 4,
  },
  scheduledRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: 2,
  },
  scheduledItem: {
    alignItems: 'center',
    gap: 4,
  },
  scheduledBubble: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  scheduledBubbleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e0e7ff',
  },
  scheduledLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
  },
  dayType: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 4,
  },
  fullDate: {
    fontSize: 13,
    color: '#e0e7ff',
  },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f2f5' },
  scroll: { flex: 1, backgroundColor: '#f0f2f5' },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 32 },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    position: 'relative',
  },
  tabBtnActive: {},
  tabBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#9ca3af',
  },
  tabBtnTextActive: {
    color: '#1a56db',
    fontWeight: '700',
  },
  tabBtnUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2,
    backgroundColor: '#1a56db',
    borderRadius: 1,
  },

  // Card
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    borderLeftWidth: 3,
    borderLeftColor: '#1a56db',
    paddingLeft: 10,
  },

  // Clock action card
  clockRow: {
    flexDirection: 'row',
    gap: 12,
  },
  clockBtn: {
    flex: 1,
    borderRadius: 100,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
    minHeight: 88,
    justifyContent: 'center',
  },
  clockBtnDisabled: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  clockBtnIn: {
    backgroundColor: '#1a56db',
    shadowColor: '#1a56db',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  clockBtnOut: {
    backgroundColor: '#e05c3e',
    shadowColor: '#e05c3e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  clockBtnIcon: { fontSize: 16, color: '#ffffff', fontWeight: '700' },
  clockBtnLabel: { fontSize: 14, fontWeight: '700', color: '#9ca3af' },
  clockBtnLabelActive: { color: '#ffffff' },
  clockBtnSub: { fontSize: 11, color: '#d1d5db' },
  actionErrorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  actionErrorText: { fontSize: 12, color: '#dc2626', textAlign: 'center', lineHeight: 18 },
  actionSuccessBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  actionSuccessText: { fontSize: 12, color: '#16a34a', textAlign: 'center', lineHeight: 18 },

  // Geofence notice
  noticeCard: { backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  noticeRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  noticeIcon: { fontSize: 18, marginTop: 2 },
  noticeTextBlock: { flex: 1, gap: 4 },
  noticeTitle: { fontSize: 13, fontWeight: '600', color: '#1e40af' },
  noticeBody: { fontSize: 12, color: '#1d4ed8', lineHeight: 18 },

  // Timeline history
  timelineList: { gap: 0 },
  timelineItem: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  dateTag: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 2,
    minWidth: 56,
  },
  dateTagTime: { fontSize: 13, fontWeight: '700', color: '#ffffff' },
  dateTagDate: { fontSize: 10, color: 'rgba(255,255,255,0.85)' },
  timelineConnector: { alignItems: 'center', gap: 0, paddingTop: 4 },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    backgroundColor: '#ffffff',
  },
  timelineVLine: { flex: 1, width: 2, backgroundColor: '#e5e7eb', minHeight: 40 },
  timelineCard: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  timelineCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineCardTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  timelineCardSub: { fontSize: 12, color: '#6b7280' },
  timelineCardNote: { fontSize: 12, color: '#374151', fontStyle: 'italic' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },

  // Leave request tab
  emptyHistory: { paddingVertical: 16, alignItems: 'center' },
  emptyHistoryText: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  goLeaveBtn: {
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  goLeaveBtnText: { fontSize: 14, fontWeight: '600', color: '#1a56db' },

  // Loading / error
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
    justifyContent: 'center',
  },
  loadingText: { fontSize: 13, color: '#6b7280' },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { fontSize: 13, color: '#dc2626', textAlign: 'center' },
  retryBtn: {
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  retryText: { fontSize: 13, fontWeight: '500', color: '#1a56db' },

  // Shared
  pressed: { opacity: 0.78 },
});
