import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/useAuth';
import { useAttendance } from '../src/hooks/useAttendance';
import { useDeviceLocation } from '../src/hooks/useDeviceLocation';
import { useOffsiteAttendance } from '../src/hooks/useOffsiteAttendance';
import type { OffSiteRequestRecord } from '../src/api/types';
import { getTodayOffSiteStatus } from '../src/api/client';
import { validateWorkLocationName, validateOffsiteReason } from '../src/utils/offsiteAttendance';

// ─── GPS accuracy bucket ──────────────────────────────────────────────────────

type GpsStatus = 'loading' | 'ready' | 'low_accuracy' | 'denied' | 'error';

function gpsStatusLabel(status: GpsStatus): string {
  switch (status) {
    case 'loading': return '📍 กำลังอ่านตำแหน่ง...';
    case 'ready': return '📍 พร้อมใช้งาน';
    case 'low_accuracy': return '📍 ความแม่นยำต่ำ';
    case 'denied': return '📍 ไม่ได้รับอนุญาต';
    case 'error': return '📍 ไม่สามารถอ่านตำแหน่ง';
  }
}

function gpsStatusColor(status: GpsStatus): string {
  switch (status) {
    case 'loading': return '#6b7280';
    case 'ready': return '#16a34a';
    case 'low_accuracy': return '#d97706';
    case 'denied': return '#dc2626';
    case 'error': return '#dc2626';
  }
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function OffsiteCheckinScreen() {
  const router = useRouter();
  const { token, isAuthenticated, isLoading } = useAuth();
  const { refresh: refreshAttendance } = useAttendance();
  const { getLocation } = useDeviceLocation();
  const mountedRef = useRef(true);

  const [workLocationName, setWorkLocationName] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [locationNameError, setLocationNameError] = useState('');
  const [reasonError, setReasonError] = useState('');
  // GPS preview pill shown on mount, purely informational — the actual submit
  // always re-acquires a fresh location via the shared useOffsiteAttendance hook.
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('loading');
  const [todayOffSite, setTodayOffSite] = useState<OffSiteRequestRecord | null>(null);

  const {
    clockInState,
    clockActionError,
    performOffsiteClockIn,
  } = useOffsiteAttendance(() => {
    refreshAttendance();
    if (mountedRef.current) router.back();
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isLoading, isAuthenticated]);

  // Fetch today's off-site pre-approval status
  useEffect(() => {
    if (!token) return;
    getTodayOffSiteStatus(token)
      .then((rec) => { if (mountedRef.current) setTodayOffSite(rec); })
      .catch(() => { /* non-critical */ });
  }, [token]);

  // Acquire GPS on mount (preview only)
  useEffect(() => {
    let cancelled = false;
    setGpsStatus('loading');
    getLocation()
      .then((loc) => {
        if (cancelled) return;
        setGpsStatus(loc.accuracy > 100 ? 'low_accuracy' : 'ready');
      })
      .catch((err: Error) => {
        if (cancelled) return;
        const msg = err.message ?? '';
        if (msg.includes('อนุญาต') || msg.includes('permission') || msg.includes('denied')) {
          setGpsStatus('denied');
        } else {
          setGpsStatus('error');
        }
      });
    return () => { cancelled = true; };
  }, []);

  const isPlanned = todayOffSite?.status === 'APPROVED';
  const submitting = clockInState === 'locating' || clockInState === 'submitting';
  const canSubmit = !submitting &&
    workLocationName.trim().length >= 1 &&
    reason.trim().length >= 3;

  function validateFields(): boolean {
    const locErr = validateWorkLocationName(workLocationName);
    setLocationNameError(locErr);
    const reasonErr = validateOffsiteReason(reason);
    setReasonError(reasonErr);
    return !locErr && !reasonErr;
  }

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    if (!validateFields()) return;
    await performOffsiteClockIn(workLocationName.trim(), reason.trim(), note.trim() || undefined);
  }, [submitting, workLocationName, reason, note, performOffsiteClockIn]);

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12} accessibilityRole="button">
          <Text style={s.backIcon}>‹</Text>
        </Pressable>
        <Text style={s.headerTitle}>ลงเวลาเข้า (นอกสถานที่)</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* GPS status pill */}
        <View style={[s.gpsPill, { borderColor: gpsStatusColor(gpsStatus) + '60' }]}>
          {gpsStatus === 'loading' && (
            <ActivityIndicator size="small" color={gpsStatusColor(gpsStatus)} style={{ marginRight: 6 }} />
          )}
          <Text style={[s.gpsText, { color: gpsStatusColor(gpsStatus) }]}>
            {gpsStatusLabel(gpsStatus)}
          </Text>
        </View>

        {/* Info banner */}
        {isPlanned ? (
          <View style={[s.infoBanner, s.infoBannerGreen]}>
            <Text style={[s.infoBannerText, s.infoBannerTextGreen]}>
              ✓ มีคำขออนุมัติสำหรับวันนี้
            </Text>
          </View>
        ) : (
          <View style={[s.infoBanner, s.infoBannerAmber]}>
            <Text style={[s.infoBannerText, s.infoBannerTextAmber]}>
              บันทึกนี้จะถูกส่งให้ HR ตรวจสอบ
            </Text>
          </View>
        )}

        {/* Location permission denied error */}
        {(gpsStatus === 'denied' || gpsStatus === 'error') && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>
              ต้องอนุญาตการเข้าถึงตำแหน่งสำหรับการลงเวลานอกสถานที่
            </Text>
          </View>
        )}

        {/* Form card */}
        <View style={s.card}>
          <Text style={s.label}>สถานที่ทำงาน *</Text>
          <TextInput
            style={[s.input, !!locationNameError && s.inputError]}
            value={workLocationName}
            onChangeText={(v) => { setWorkLocationName(v); if (locationNameError) setLocationNameError(''); }}
            placeholder="เช่น ลูกค้า ABC, ทำงานที่บ้าน, สาขาลาดพร้าว"
            placeholderTextColor="#9ca3af"
            maxLength={200}
            autoCorrect={false}
          />
          {!!locationNameError && <Text style={s.fieldError}>{locationNameError}</Text>}

          <Text style={[s.label, { marginTop: 16 }]}>เหตุผล *</Text>
          <TextInput
            style={[s.input, s.textArea, !!reasonError && s.inputError]}
            value={reason}
            onChangeText={(v) => { setReason(v); if (reasonError) setReasonError(''); }}
            placeholder="อธิบายเหตุผลที่ทำงานนอกสถานที่วันนี้"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            maxLength={500}
          />
          {!!reasonError && <Text style={s.fieldError}>{reasonError}</Text>}

          <Text style={[s.label, { marginTop: 16 }]}>หมายเหตุ (ไม่จำเป็น)</Text>
          <TextInput
            style={[s.input, s.textArea]}
            value={note}
            onChangeText={setNote}
            placeholder="เพิ่มเติม (ถ้ามี)"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={2}
            textAlignVertical="top"
            maxLength={500}
          />
        </View>

        {/* Submit error */}
        {!!clockActionError && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{clockActionError}</Text>
          </View>
        )}

        {/* Confirm button */}
        <Pressable
          style={({ pressed }) => [
            s.submitBtn,
            (!canSubmit) && s.submitBtnDisabled,
            pressed && canSubmit && { opacity: 0.85 },
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="ยืนยันลงเวลาเข้า (นอกสถานที่)"
        >
          {submitting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.submitBtnText}>ยืนยันลงเวลาเข้า (นอกสถานที่)</Text>
          }
        </Pressable>

        <Text style={s.hint}>
          ตำแหน่ง GPS จะถูกบันทึกเพื่อยืนยันการลงเวลา
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const TEAL = '#0d9488';

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: TEAL },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: TEAL,
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  backIcon: { fontSize: 28, color: '#ffffff', lineHeight: 32 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#ffffff' },

  scroll: { flex: 1, backgroundColor: '#f0f2f5' },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 40 },

  gpsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ffffff',
  },
  gpsText: { fontSize: 13, fontWeight: '600' },

  infoBanner: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  infoBannerGreen: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  infoBannerAmber: { backgroundColor: '#fffbeb', borderColor: '#fde68a' },
  infoBannerText: { fontSize: 13, fontWeight: '600', lineHeight: 18 },
  infoBannerTextGreen: { color: '#16a34a' },
  infoBannerTextAmber: { color: '#92400e' },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  label: { fontSize: 13, fontWeight: '600', color: '#374151' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
    marginTop: 4,
  },
  inputError: { borderColor: '#ef4444' },
  textArea: { minHeight: 80, paddingTop: 10 },
  fieldError: { fontSize: 12, color: '#ef4444', marginTop: 2 },

  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { fontSize: 13, color: '#dc2626', lineHeight: 18 },

  submitBtn: {
    backgroundColor: TEAL,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    shadowColor: TEAL,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  hint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 18,
  },
});
