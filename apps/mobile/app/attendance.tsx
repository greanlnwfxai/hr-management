import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { useOffSiteRequests } from '../src/hooks/useOffSiteRequests';
import type { AttendanceRecord, AttendanceStatus, OffSiteRequestRecord } from '../src/api/types';
import type { ClockActionState } from '../src/hooks/useAttendance';
import { MobileBottomNav } from '../src/components';

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

function AttendanceHeader({
  today,
  onProfilePress,
}: {
  today: AttendanceRecord | null;
  onProfilePress: () => void;
}) {
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
      <View style={hdr.topRow}>
        <View>
          <Text style={hdr.screenTitle}>ลงเวลา</Text>
          <Text style={hdr.screenSubtitle}>ภาพรวมการลงเวลา 08:30–17:30</Text>
        </View>
        <Pressable
          style={({ pressed }) => [hdr.profileShortcut, pressed && styles.pressed]}
          onPress={onProfilePress}
          accessibilityRole="button"
        >
          <Text style={hdr.profileShortcutText}>โปรไฟล์</Text>
        </Pressable>
      </View>

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
      <View style={hdr.summaryRow}>
        <View style={hdr.summaryPill}>
          <Text style={hdr.summaryLabel}>เช็คอิน</Text>
          <Text style={hdr.summaryValue}>{inTime}</Text>
        </View>
        <View style={hdr.summaryPill}>
          <Text style={hdr.summaryLabel}>เช็คเอาท์</Text>
          <Text style={hdr.summaryValue}>{outTime}</Text>
        </View>
      </View>
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
  isOffSiteApproved?: boolean;
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
  isOffSiteApproved,
}: ClockActionCardProps) {
  const inBusy = clockInState === 'locating' || clockInState === 'submitting';
  const outBusy = clockOutState === 'locating' || clockOutState === 'submitting';
  const alreadyClockedIn = Boolean(today?.checkIn);
  const alreadyClockedOut = Boolean(today?.checkOut);
  const inDisabled = dataLoading || inBusy || outBusy || alreadyClockedIn;
  const outDisabled = dataLoading || inBusy || outBusy || !alreadyClockedIn || alreadyClockedOut;

  return (
    <View style={styles.card}>
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardTitle}>ลงเวลา</Text>
        {isOffSiteApproved && (
          <View style={styles.offsiteBadge}>
            <Text style={styles.offsiteBadgeText}>🗺 นอกสถานที่</Text>
          </View>
        )}
      </View>
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
              <View style={styles.timelineCardSubRow}>
                <Text style={styles.timelineCardSub}>ผ่านมือถือ</Text>
                {rec.workMode === 'OFFSITE' && (
                  <View style={styles.offSiteHistoryBadge}>
                    <Text style={styles.offSiteHistoryBadgeText}>นอกสถานที่</Text>
                  </View>
                )}
              </View>
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

function offSiteStatusLabel(status: OffSiteRequestRecord['status']): string {
  switch (status) {
    case 'PENDING': return 'รอการอนุมัติ';
    case 'APPROVED': return 'อนุมัติแล้ว';
    case 'REJECTED': return 'ไม่อนุมัติ';
  }
}
function offSiteStatusColor(status: OffSiteRequestRecord['status']): string {
  switch (status) {
    case 'PENDING': return '#d97706';
    case 'APPROVED': return '#16a34a';
    case 'REJECTED': return '#dc2626';
  }
}

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
    todayOffSite,
  } = useAttendance();
  const { requests: offSiteRequests, loadState: offSiteLoadState, refresh: refreshOffSite } = useOffSiteRequests();

  const [activeTab, setActiveTab] = useState<'time' | 'request'>('time');
  const isOffSiteApproved = todayOffSite?.status === 'APPROVED';

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

  const isRefreshing = loadState === 'loading';

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <AttendanceHeader today={today} onProfilePress={() => router.push('/profile')} />

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
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#3b82f6" />
        }
      >
        {activeTab === 'time' && (
          <>
            <ClockActionCard
              today={today}
              dataLoading={loadState === 'loading'}
              clockInState={clockInState}
              clockOutState={clockOutState}
              actionError={clockActionError}
              actionMessage={clockActionMessage}
              onClockIn={performClockIn}
              onClockOut={performClockOut}
              isOffSiteApproved={isOffSiteApproved}
            />

            <GeofenceNotice />

            {loadState === 'loading' && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#3b82f6" size="small" />
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

            {loadState === 'success' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>ประวัติการลงเวลา</Text>
                <HistoryTimeline records={history} />
              </View>
            )}
          </>
        )}

        {activeTab === 'request' && (
          <>
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>คำขอทำงานนอกสถานที่</Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.goLeaveBtn, pressed && styles.pressed]}
                onPress={() => router.push('/offsite-request')}
                accessibilityRole="button"
              >
                <Text style={styles.goLeaveBtnText}>+ ขอทำงานนอกสถานที่</Text>
              </Pressable>

              {offSiteLoadState === 'loading' && (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#3b82f6" size="small" />
                  <Text style={styles.loadingText}>กำลังโหลด</Text>
                </View>
              )}

              {offSiteRequests.length === 0 && offSiteLoadState === 'success' && (
                <Text style={styles.emptyHistoryText}>ยังไม่มีคำขอทำงานนอกสถานที่</Text>
              )}

              {offSiteRequests.map((req) => {
                const sc = offSiteStatusColor(req.status);
                return (
                  <View key={req.id} style={styles.offSiteRow}>
                    <View style={styles.offSiteRowLeft}>
                      <Text style={styles.offSiteDate}>{req.date.split('T')[0]}</Text>
                      {!!req.reason && (
                        <Text style={styles.offSiteReason} numberOfLines={1}>{req.reason}</Text>
                      )}
                    </View>
                    <View style={[styles.offSiteStatusBadge, { backgroundColor: sc + '20' }]}>
                      <Text style={[styles.offSiteStatusText, { color: sc }]}>
                        {offSiteStatusLabel(req.status)}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>คำขอลา</Text>
              <Pressable
                style={({ pressed }) => [styles.goLeaveBtn, pressed && styles.pressed]}
                onPress={() => router.push('/leave')}
                accessibilityRole="button"
              >
                <Text style={styles.goLeaveBtnText}>ไปหน้าการลา →</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
      <MobileBottomNav />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const hdr = StyleSheet.create({
  container: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 12,
    shadowColor: '#1e3a8a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
  },
  screenSubtitle: {
    fontSize: 12,
    color: '#bfdbfe',
    marginTop: 2,
  },
  profileShortcut: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  profileShortcutText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
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
    backgroundColor: '#1d4ed8',
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
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
    marginTop: 4,
  },
  summaryPill: {
    flexGrow: 1,
    minWidth: 128,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    gap: 2,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#bfdbfe',
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 16,
    color: '#ffffff',
    fontWeight: '700',
  },
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f0f2f5' },
  scroll: { flex: 1, backgroundColor: '#f0f2f5' },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 24 },

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
    color: '#3b82f6',
    fontWeight: '700',
  },
  tabBtnUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '25%',
    right: '25%',
    height: 2,
    backgroundColor: '#3b82f6',
    borderRadius: 1,
  },

  // Card title row (for badge alongside title)
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Off-site badge on clock-in card
  offsiteBadge: {
    backgroundColor: '#dbeafe',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  offsiteBadgeText: { fontSize: 11, fontWeight: '600', color: '#1d4ed8' },

  // Off-site badge in history timeline
  offSiteHistoryBadge: {
    backgroundColor: '#dbeafe',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginLeft: 6,
  },
  offSiteHistoryBadgeText: { fontSize: 10, fontWeight: '600', color: '#1d4ed8' },
  timelineCardSubRow: { flexDirection: 'row', alignItems: 'center' },

  // Off-site request list rows
  offSiteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 10,
  },
  offSiteRowLeft: { flex: 1, gap: 2 },
  offSiteDate: { fontSize: 13, fontWeight: '600', color: '#111827' },
  offSiteReason: { fontSize: 12, color: '#6b7280' },
  offSiteStatusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  offSiteStatusText: { fontSize: 11, fontWeight: '600' },

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
    borderLeftColor: '#3b82f6',
    paddingLeft: 10,
    flexShrink: 1,
  },

  // Clock action card
  clockRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  clockBtn: {
    flexGrow: 1,
    flexBasis: 148,
    borderRadius: 100,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
    minHeight: 56,
    justifyContent: 'center',
  },
  clockBtnDisabled: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  clockBtnIn: {
    backgroundColor: '#3b82f6',
    shadowColor: '#3b82f6',
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
    borderRadius: 12,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#eef2f7',
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
  goLeaveBtnText: { fontSize: 14, fontWeight: '600', color: '#3b82f6' },

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
  retryText: { fontSize: 13, fontWeight: '500', color: '#3b82f6' },

  // Shared
  pressed: { opacity: 0.78 },
});
