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
import { useAttendance } from '../src/hooks/useAttendance';
import type { AttendanceRecord, AttendanceStatus } from '../src/api/types';
import type { ClockActionState } from '../src/hooks/useAttendance';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function TodayCard({ record }: { record: AttendanceRecord | null }) {
  const today = new Date();
  const todayLabel = today.toLocaleDateString('th-TH', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>การลงเวลาวันนี้</Text>
      <Text style={styles.dateText}>{todayLabel}</Text>

      {record ? (
        <>
          <View style={styles.divider} />
          <View style={styles.timeRow}>
            <View style={styles.timeItem}>
              <Text style={styles.timeLabel}>เวลาเข้างาน</Text>
              <Text style={styles.timeValue}>{formatTime(record.checkIn)}</Text>
            </View>
            <View style={styles.timeItem}>
              <Text style={styles.timeLabel}>เวลาออกงาน</Text>
              <Text style={styles.timeValue}>{formatTime(record.checkOut)}</Text>
            </View>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>สถานะ</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor(record.status) + '20' }]}>
              <Text style={[styles.statusBadgeText, { color: statusColor(record.status) }]}>
                {statusLabel(record.status)}
              </Text>
            </View>
          </View>
          {record.note ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>หมายเหตุ</Text>
              <Text style={styles.metaValue}>{record.note}</Text>
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.emptyTodayBox}>
          <Text style={styles.emptyTodayIcon}>📋</Text>
          <Text style={styles.emptyTodayText}>ยังไม่ลงเวลาวันนี้</Text>
        </View>
      )}
    </View>
  );
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

function clockInLabel(state: ClockActionState): string {
  if (state === 'locating') return 'กำลังตรวจสอบตำแหน่ง...';
  if (state === 'submitting') return 'กำลังลงเวลาเข้า...';
  return 'ลงเวลาเข้า';
}

function clockOutLabel(state: ClockActionState): string {
  if (state === 'locating') return 'กำลังตรวจสอบตำแหน่ง...';
  if (state === 'submitting') return 'กำลังลงเวลาออก...';
  return 'ลงเวลาออก';
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
          accessibilityLabel="ลงเวลาเข้า"
        >
          {inBusy ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.clockBtnIcon}>⬆️</Text>
          )}
          <Text style={[styles.clockBtnLabel, !inDisabled && styles.clockBtnLabelActive]}>
            {clockInLabel(clockInState)}
          </Text>
          {alreadyClockedIn && !inBusy && (
            <Text style={styles.clockBtnSub}>ลงเวลาแล้ว</Text>
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
          accessibilityLabel="ลงเวลาออก"
        >
          {outBusy ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={styles.clockBtnIcon}>⬇️</Text>
          )}
          <Text style={[styles.clockBtnLabel, !outDisabled && styles.clockBtnLabelActive]}>
            {clockOutLabel(clockOutState)}
          </Text>
          {alreadyClockedOut && !outBusy && (
            <Text style={styles.clockBtnSub}>ลงเวลาแล้ว</Text>
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
          <Text style={styles.noticeBody}>
            ระบบจะส่งตำแหน่งไปให้เซิร์ฟเวอร์ตรวจสอบเท่านั้น
          </Text>
        </View>
      </View>
    </View>
  );
}

function HistoryRow({ record }: { record: AttendanceRecord }) {
  return (
    <View style={styles.historyRow}>
      <View style={styles.historyLeft}>
        <Text style={styles.historyDate}>{formatShortDate(record.date)}</Text>
        <Text style={styles.historyTime}>
          {formatTime(record.checkIn)} — {formatTime(record.checkOut)}
        </Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: statusColor(record.status) + '20' }]}>
        <Text style={[styles.statusBadgeText, { color: statusColor(record.status) }]}>
          {statusLabel(record.status)}
        </Text>
      </View>
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
    lastUpdated,
    refresh,
    clockInState,
    clockOutState,
    clockActionError,
    clockActionMessage,
    performClockIn,
    performClockOut,
  } = useAttendance();

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

  function formatTime2(date: Date | null): string {
    if (!date) return '—';
    return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#1a56db" />
        }
      >
        {/* ── Today card ───────────────────────────────────────────────── */}
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

        {(loadState === 'success' || loadState === 'idle') && (
          <TodayCard record={today} />
        )}

        {/* ── Clock actions ────────────────────────────────────────────── */}
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

        {/* ── Geofence notice ──────────────────────────────────────────── */}
        <GeofenceNotice />

        {/* ── History ──────────────────────────────────────────────────── */}
        {loadState === 'success' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>ประวัติการลงเวลา</Text>

            {history.length === 0 ? (
              <View style={styles.emptyHistory}>
                <Text style={styles.emptyHistoryText}>ไม่พบประวัติการลงเวลา</Text>
              </View>
            ) : (
              <>
                {history.map((record) => (
                  <HistoryRow key={record.id} record={record} />
                ))}
              </>
            )}
          </View>
        )}

        {/* ── Last updated + Refresh ───────────────────────────────────── */}
        {loadState === 'success' && lastUpdated && (
          <View style={styles.updatedRow}>
            <Text style={styles.updatedLabel}>อัปเดตล่าสุด</Text>
            <Text style={styles.updatedValue}>{formatTime2(lastUpdated)}</Text>
          </View>
        )}

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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scroll: {
    padding: 16,
    gap: 14,
    paddingBottom: 32,
  },

  // Card
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
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  noticeCard: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },

  // Today card
  dateText: {
    fontSize: 13,
    color: '#6b7280',
  },
  divider: {
    height: 1,
    backgroundColor: '#f3f4f6',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 16,
  },
  timeItem: {
    flex: 1,
    gap: 4,
  },
  timeLabel: {
    fontSize: 12,
    color: '#6b7280',
  },
  timeValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
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
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  emptyTodayBox: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  emptyTodayIcon: {
    fontSize: 28,
  },
  emptyTodayText: {
    fontSize: 14,
    color: '#9ca3af',
  },

  // Clock action card
  clockRow: {
    flexDirection: 'row',
    gap: 12,
  },
  clockBtn: {
    flex: 1,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 4,
    minHeight: 80,
    justifyContent: 'center',
  },
  clockBtnDisabled: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  clockBtnIn: {
    backgroundColor: '#16a34a',
  },
  clockBtnOut: {
    backgroundColor: '#dc2626',
  },
  clockBtnIcon: {
    fontSize: 22,
  },
  clockBtnLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9ca3af',
  },
  clockBtnLabelActive: {
    color: '#ffffff',
  },
  clockBtnSub: {
    fontSize: 11,
    color: '#d1d5db',
  },
  actionErrorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  actionErrorText: {
    fontSize: 12,
    color: '#dc2626',
    textAlign: 'center',
    lineHeight: 18,
  },
  actionSuccessBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  actionSuccessText: {
    fontSize: 12,
    color: '#16a34a',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Geofence notice
  noticeRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  noticeIcon: {
    fontSize: 18,
    marginTop: 2,
  },
  noticeTextBlock: {
    flex: 1,
    gap: 4,
  },
  noticeTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e40af',
  },
  noticeBody: {
    fontSize: 12,
    color: '#1d4ed8',
    lineHeight: 18,
  },

  // History
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  historyLeft: {
    gap: 2,
  },
  historyDate: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111827',
  },
  historyTime: {
    fontSize: 11,
    color: '#6b7280',
  },
  emptyHistory: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyHistoryText: {
    fontSize: 13,
    color: '#9ca3af',
  },

  // Loading / error
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 20,
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    color: '#6b7280',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 12,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    textAlign: 'center',
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

  // Updated row
  updatedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
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

  // Shared
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.55 },
});
