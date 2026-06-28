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
import { clockOutOffsite } from '../src/api/client';
import { SessionExpiredError } from '../src/api/types';

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

export default function OffsiteCheckoutScreen() {
  const router = useRouter();
  const { token, isAuthenticated, isLoading, signOut } = useAuth();
  const { refresh: refreshAttendance } = useAttendance();
  const { getLocation } = useDeviceLocation();

  const [note, setNote] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('loading');
  const [location, setLocation] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace('/login');
  }, [isLoading, isAuthenticated]);

  // Acquire GPS on mount
  useEffect(() => {
    let cancelled = false;
    setGpsStatus('loading');
    getLocation()
      .then((loc) => {
        if (cancelled) return;
        setLocation(loc);
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

  const canSubmit = (gpsStatus === 'ready' || gpsStatus === 'low_accuracy') && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!token || submitting) return;
    if (!location) {
      setSubmitError('ต้องระบุตำแหน่งสำหรับการลงเวลานอกสถานที่');
      return;
    }

    setSubmitError('');
    setSubmitting(true);
    try {
      await clockOutOffsite(token, {
        ...location,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      refreshAttendance();
      if (mountedRef.current) router.back();
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        await signOut();
        router.replace('/login');
        return;
      }
      if (mountedRef.current) {
        setSubmitError(translateError(err instanceof Error ? err.message : ''));
        setSubmitting(false);
        if ((err instanceof Error) && err.message.includes('accuracy')) {
          setGpsStatus('loading');
          getLocation()
            .then((loc) => {
              if (!mountedRef.current) return;
              setLocation(loc);
              setGpsStatus(loc.accuracy > 100 ? 'low_accuracy' : 'ready');
            })
            .catch(() => { if (mountedRef.current) setGpsStatus('error'); });
        }
      }
    }
  }, [token, submitting, location, note, getLocation, refreshAttendance, signOut, router]);

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12} accessibilityRole="button">
          <Text style={s.backIcon}>‹</Text>
        </Pressable>
        <Text style={s.headerTitle}>ลงเวลาออก (นอกสถานที่)</Text>
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

        {/* Location error */}
        {(gpsStatus === 'denied' || gpsStatus === 'error') && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>
              ต้องอนุญาตการเข้าถึงตำแหน่งสำหรับการลงเวลานอกสถานที่
            </Text>
          </View>
        )}

        {/* Form card */}
        <View style={s.card}>
          <Text style={s.label}>หมายเหตุ (ไม่จำเป็น)</Text>
          <TextInput
            style={[s.input, s.textArea]}
            value={note}
            onChangeText={setNote}
            placeholder="เพิ่มเติม (ถ้ามี)"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            maxLength={500}
          />
        </View>

        {/* Submit error */}
        {!!submitError && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{submitError}</Text>
          </View>
        )}

        {/* Confirm button */}
        <Pressable
          style={({ pressed }) => [
            s.submitBtn,
            !canSubmit && s.submitBtnDisabled,
            pressed && canSubmit && { opacity: 0.85 },
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="ยืนยันลงเวลาออก (นอกสถานที่)"
        >
          {submitting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.submitBtnText}>ยืนยันลงเวลาออก (นอกสถานที่)</Text>
          }
        </Pressable>

        <Text style={s.hint}>
          ตำแหน่ง GPS จะถูกบันทึกเพื่อยืนยันการลงเวลาออก
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function translateError(msg: string): string {
  if (msg.includes('accuracy')) return 'ความแม่นยำ GPS ต่ำเกินไป กรุณาเดินออกนอกอาคารหรือลองใหม่';
  if (msg.includes('Already clocked out')) return 'ลงเวลาออกไปแล้วสำหรับวันนี้';
  if (msg.includes('No clock-in') || msg.includes('No active clock-in')) return 'ยังไม่มีการลงเวลาเข้าสำหรับวันนี้';
  if (msg.includes('No employee profile')) return 'ไม่พบข้อมูลพนักงานที่เชื่อมกับบัญชีนี้';
  if (msg.includes('ไม่สามารถเชื่อมต่อ')) return 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้';
  return msg || 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่อีกครั้ง';
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
  textArea: { minHeight: 80, paddingTop: 10 },

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
