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
import { submitMixedCheckoutException } from '../src/api/client';
import { SessionExpiredError } from '../src/api/types';

type GpsStatus = 'loading' | 'ready' | 'poor_accuracy' | 'denied' | 'error';

function gpsStatusLabel(status: GpsStatus): string {
  switch (status) {
    case 'loading': return '📍 กำลังอ่านตำแหน่ง...';
    case 'ready': return '📍 พร้อมใช้งาน';
    case 'poor_accuracy': return '📍 ความแม่นยำต่ำเกินไป (ต้องการ ≤100 ม.)';
    case 'denied': return '📍 ไม่ได้รับอนุญาต';
    case 'error': return '📍 ไม่สามารถอ่านตำแหน่ง';
  }
}

function gpsStatusColor(status: GpsStatus): string {
  switch (status) {
    case 'loading': return '#6b7280';
    case 'ready': return '#16a34a';
    case 'poor_accuracy': return '#dc2626';
    case 'denied': return '#dc2626';
    case 'error': return '#dc2626';
  }
}

export default function MixedCheckoutScreen() {
  const router = useRouter();
  const { token, isAuthenticated, isLoading, signOut } = useAuth();
  const { refresh: refreshAttendance } = useAttendance();
  const { getLocation } = useDeviceLocation();

  const [workLocationName, setWorkLocationName] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ workLocationName?: string; reason?: string }>({});
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

  useEffect(() => {
    let cancelled = false;
    setGpsStatus('loading');
    getLocation()
      .then((loc) => {
        if (cancelled) return;
        setLocation(loc);
        setGpsStatus(loc.accuracy <= 100 ? 'ready' : 'poor_accuracy');
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

  const validateFields = useCallback((): boolean => {
    const errors: { workLocationName?: string; reason?: string } = {};
    if (!workLocationName.trim()) errors.workLocationName = 'กรุณาระบุสถานที่';
    if (reason.trim().length < 3) errors.reason = 'กรุณาระบุเหตุผล (อย่างน้อย 3 ตัวอักษร)';
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }, [workLocationName, reason]);

  const canSubmit = gpsStatus === 'ready' && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!token || submitting) return;
    if (!validateFields()) return;

    setSubmitError('');
    setSubmitting(true);

    // Re-acquire fresh GPS at submit time — never use the mount-time cached reading
    setGpsStatus('loading');
    let freshLocation: { latitude: number; longitude: number; accuracy: number };
    try {
      freshLocation = await getLocation();
    } catch (err) {
      if (!mountedRef.current) return;
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('อนุญาต') || msg.includes('permission') || msg.includes('denied')) {
        setGpsStatus('denied');
      } else {
        setGpsStatus('error');
      }
      setSubmitting(false);
      return;
    }

    if (freshLocation.accuracy > 100) {
      if (!mountedRef.current) return;
      setLocation(freshLocation);
      setGpsStatus('poor_accuracy');
      setSubmitError('ความแม่นยำ GPS ต่ำเกินไป กรุณาเดินออกนอกอาคารหรือลองใหม่');
      setSubmitting(false);
      return;
    }

    setLocation(freshLocation);
    setGpsStatus('ready');

    try {
      await submitMixedCheckoutException(token, {
        latitude: freshLocation.latitude,
        longitude: freshLocation.longitude,
        accuracy: freshLocation.accuracy,
        workLocationName: workLocationName.trim(),
        reason: reason.trim(),
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
      }
    }
  }, [token, submitting, workLocationName, reason, note, validateFields, getLocation, refreshAttendance, signOut, router]);

  return (
    <SafeAreaView style={s.root} edges={['top', 'left', 'right']}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.backBtn} hitSlop={12} accessibilityRole="button">
          <Text style={s.backIcon}>‹</Text>
        </Pressable>
        <Text style={s.headerTitle}>เช็คเอาท์นอกสถานที่</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.noticeBanner}>
          <Text style={s.noticeBannerText}>
            บันทึกนี้จะถูกส่งให้ HR ตรวจสอบ ไม่สามารถส่งคำขอนี้ซ้ำได้
          </Text>
        </View>

        <View style={[s.gpsPill, { borderColor: gpsStatusColor(gpsStatus) + '60' }]}>
          {gpsStatus === 'loading' && (
            <ActivityIndicator size="small" color={gpsStatusColor(gpsStatus)} style={{ marginRight: 6 }} />
          )}
          <Text style={[s.gpsText, { color: gpsStatusColor(gpsStatus) }]}>
            {gpsStatusLabel(gpsStatus)}
          </Text>
        </View>

        {(gpsStatus === 'denied' || gpsStatus === 'error') && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>ต้องอนุญาตการเข้าถึงตำแหน่งก่อนส่งบันทึก</Text>
          </View>
        )}

        {gpsStatus === 'poor_accuracy' && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>
              ความแม่นยำ GPS ต่ำเกินไป กรุณาเดินออกนอกอาคารหรือรอสักครู่
            </Text>
          </View>
        )}

        <View style={s.card}>
          <Text style={s.label}>สถานที่ทำงาน *</Text>
          <TextInput
            style={[s.input, !!fieldErrors.workLocationName && s.inputError]}
            value={workLocationName}
            onChangeText={(v) => {
              setWorkLocationName(v);
              if (fieldErrors.workLocationName) setFieldErrors(p => ({ ...p, workLocationName: undefined }));
            }}
            placeholder="เช่น สำนักงานลูกค้า / ร้านกาแฟ ABC"
            placeholderTextColor="#9ca3af"
            maxLength={200}
            returnKeyType="next"
          />
          {!!fieldErrors.workLocationName && (
            <Text style={s.fieldError}>{fieldErrors.workLocationName}</Text>
          )}

          <Text style={[s.label, { marginTop: 12 }]}>เหตุผล *</Text>
          <TextInput
            style={[s.input, s.textArea, !!fieldErrors.reason && s.inputError]}
            value={reason}
            onChangeText={(v) => {
              setReason(v);
              if (fieldErrors.reason) setFieldErrors(p => ({ ...p, reason: undefined }));
            }}
            placeholder="กรุณาระบุเหตุผลที่ไม่สามารถเช็คเอาท์ในบริษัทได้ (อย่างน้อย 3 ตัวอักษร)"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            maxLength={500}
          />
          {!!fieldErrors.reason && (
            <Text style={s.fieldError}>{fieldErrors.reason}</Text>
          )}

          <Text style={[s.label, { marginTop: 12 }]}>หมายเหตุเพิ่มเติม (ไม่จำเป็น)</Text>
          <TextInput
            style={[s.input, s.textArea]}
            value={note}
            onChangeText={setNote}
            placeholder="ข้อมูลเพิ่มเติม (ถ้ามี)"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={2}
            textAlignVertical="top"
            maxLength={500}
          />
        </View>

        {!!submitError && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{submitError}</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            s.submitBtn,
            !canSubmit && s.submitBtnDisabled,
            pressed && canSubmit && { opacity: 0.85 },
          ]}
          onPress={handleSubmit}
          disabled={!canSubmit}
          accessibilityRole="button"
          accessibilityLabel="ยืนยันเช็คเอาท์นอกสถานที่"
        >
          {submitting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.submitBtnText}>ยืนยันเช็คเอาท์นอกสถานที่</Text>
          }
        </Pressable>

        <Text style={s.hint}>
          ตำแหน่ง GPS จะถูกบันทึกเพื่อประกอบการตรวจสอบ
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function translateError(msg: string): string {
  if (msg.includes('accuracy')) return 'ความแม่นยำ GPS ต่ำเกินไป กรุณาลองใหม่อีกครั้ง';
  if (msg.includes('Already checked out') || msg.includes('Already clocked out')) return 'ลงเวลาออกไปแล้วสำหรับวันนี้';
  if (msg.includes('exception already submitted')) return 'ส่งคำขอเช็คเอาท์นอกสถานที่ไปแล้ว';
  if (msg.includes('No clock-in') || msg.includes('No active clock-in')) return 'ยังไม่มีการลงเวลาเข้าสำหรับวันนี้';
  if (msg.includes('not ONSITE')) return 'บันทึกนี้ไม่ใช่ประเภท ONSITE';
  if (msg.includes('inside the allowed') || msg.includes('inside geofence')) return 'คุณอยู่ในพื้นที่บริษัท ไม่จำเป็นต้องใช้ฟีเจอร์นี้';
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

  noticeBanner: {
    backgroundColor: '#fffbeb',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  noticeBannerText: { fontSize: 13, color: '#92400e', lineHeight: 18 },

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
  inputError: { borderColor: '#dc2626' },
  textArea: { minHeight: 80, paddingTop: 10 },
  fieldError: { fontSize: 12, color: '#dc2626', marginTop: 4 },

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
