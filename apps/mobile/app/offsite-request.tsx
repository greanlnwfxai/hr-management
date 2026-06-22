import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useOffSiteRequests } from '../src/hooks/useOffSiteRequests';
import { MobileScreenHeader } from '../src/components';

export default function OffSiteRequestScreen() {
  const router = useRouter();
  const { submit, submitState, submitError } = useOffSiteRequests();

  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const [dateError, setDateError] = useState('');

  const isSubmitting = submitState === 'submitting';

  function validateDate(value: string): boolean {
    if (!value.trim()) { setDateError('กรุณากรอกวันที่'); return false; }
    const pattern = /^\d{4}-\d{2}-\d{2}$/;
    if (!pattern.test(value)) { setDateError('รูปแบบวันที่ไม่ถูกต้อง (YYYY-MM-DD)'); return false; }
    if (isNaN(Date.parse(value))) { setDateError('วันที่ไม่ถูกต้อง'); return false; }
    setDateError('');
    return true;
  }

  async function handleSubmit() {
    if (!validateDate(date)) return;

    const ok = await submit({ date: date.trim(), reason: reason.trim() || undefined });
    if (ok) {
      Alert.alert('สำเร็จ', 'ส่งคำขอทำงานนอกสถานที่แล้ว รอการอนุมัติจากผู้จัดการ', [
        { text: 'ตกลง', onPress: () => router.back() },
      ]);
    }
  }

  return (
    <View style={s.container}>
      <MobileScreenHeader
        dark
        title="ขอทำงานนอกสถานที่"
        subtitle="กรอกข้อมูลและรอการอนุมัติ"
        backHref="/attendance"
      />

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Text style={s.label}>วันที่ทำงานนอกสถานที่ *</Text>
          <TextInput
            style={[s.input, !!dateError && s.inputError]}
            value={date}
            onChangeText={(v) => { setDate(v); if (dateError) validateDate(v); }}
            placeholder="YYYY-MM-DD เช่น 2026-06-25"
            placeholderTextColor="#9ca3af"
            keyboardType="numbers-and-punctuation"
            autoCorrect={false}
          />
          {!!dateError && <Text style={s.fieldError}>{dateError}</Text>}

          <Text style={[s.label, { marginTop: 16 }]}>สถานที่ / เหตุผล (ถ้ามี)</Text>
          <TextInput
            style={[s.input, s.textArea]}
            value={reason}
            onChangeText={setReason}
            placeholder="เช่น ไปพบลูกค้าที่สาขาเชียงใหม่"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {!!submitError && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{submitError}</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          style={[s.submitBtn, isSubmitting && s.submitBtnDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          activeOpacity={0.8}
        >
          {isSubmitting
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.submitBtnText}>ส่งคำขอ</Text>
          }
        </TouchableOpacity>

        <Text style={s.hint}>
          คำขอจะถูกส่งให้ผู้จัดการแผนกอนุมัติ{'\n'}
          เมื่ออนุมัติแล้วจึงสามารถลงเวลาแบบนอกสถานที่ได้
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { padding: 16, gap: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
    backgroundColor: '#f9fafb',
  },
  inputError: { borderColor: '#ef4444' },
  textArea: { minHeight: 80, paddingTop: 10 },
  fieldError: { fontSize: 12, color: '#ef4444', marginTop: 4 },
  errorBox: {
    marginTop: 12,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: { fontSize: 13, color: '#dc2626' },
  submitBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: {
    textAlign: 'center',
    fontSize: 12,
    color: '#9ca3af',
    lineHeight: 18,
  },
});
