import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../src/auth/useAuth';
import { useLeave, LEAVE_TYPE_OPTIONS, leaveTypeLabel, leaveStatusLabel, leaveStatusColor } from '../src/hooks/useLeave';
import type { LeaveType, LeaveBalanceRecord, LeaveRequestRecord } from '../src/api/types';
import { MobileBottomNav, MobileScreenHeader } from '../src/components';
import { canUseManagerApproval } from '../src/utils/roles';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function validateDateFormat(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

function isoToDate(iso: string): Date {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date() : d;
}

function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function calculateLeaveDays(startDate: string, endDate: string): number | null {
  if (!validateDateFormat(startDate) || !validateDateFormat(endDate)) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (start > end) return null;
  const diff = end.getTime() - start.getTime();
  return Math.floor(diff / 86400000) + 1;
}

function DatePickerField({
  label,
  value,
  onChange,
  error,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const dateValue = value ? isoToDate(value) : new Date();

  function handleChange(_event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS !== 'ios') setShowPicker(false);
    if (selected) onChange(dateToIso(selected));
  }

  if (Platform.OS === 'web') {
    return (
      <View>
        <Text style={styles.fieldLabel}>{label}</Text>
        {React.createElement('input', {
          type: 'date',
          value: value,
          onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
          disabled: disabled,
          style: {
            width: '100%',
            border: `1px solid ${error ? '#f87171' : '#d1d5db'}`,
            borderRadius: '8px',
            padding: '10px 12px',
            fontSize: '14px',
            color: '#111827',
            backgroundColor: '#ffffff',
            boxSizing: 'border-box',
            cursor: 'pointer',
            fontFamily: 'inherit',
            outline: 'none',
          },
        })}
        {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Pressable
        onPress={() => !disabled && setShowPicker(true)}
        style={({ pressed }) => [
          styles.dateBtn,
          error ? styles.inputError : undefined,
          pressed && !disabled ? styles.pressed : undefined,
          disabled ? styles.disabled : undefined,
        ]}
      >
        <Text style={value ? styles.dateBtnText : styles.dateBtnPlaceholder}>
          {value ? formatShortDate(value) : 'เลือกวันที่'}
        </Text>
        <Text style={styles.calendarIcon}>📅</Text>
      </Pressable>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
      {showPicker && (
        <DateTimePicker
          value={dateValue}
          mode="date"
          display="default"
          onChange={handleChange}
        />
      )}
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BalanceRow({ record }: { record: LeaveBalanceRecord }) {
  return (
    <View style={styles.balanceRow}>
      <View style={styles.balanceLeft}>
        <Text style={styles.balanceType}>{leaveTypeLabel(record.leaveType)}</Text>
        <Text style={styles.balanceYear}>ปี {record.year}</Text>
      </View>
      <View style={styles.balanceRight}>
        <View style={styles.balanceStat}>
          <Text style={styles.balanceStatValue}>{record.totalDays}</Text>
          <Text style={styles.balanceStatLabel}>วันทั้งหมด</Text>
        </View>
        <View style={styles.balanceStat}>
          <Text style={[styles.balanceStatValue, { color: '#d97706' }]}>{record.usedDays}</Text>
          <Text style={styles.balanceStatLabel}>ใช้ไปแล้ว</Text>
        </View>
        <View style={styles.balanceStat}>
          <Text style={[styles.balanceStatValue, { color: '#16a34a' }]}>{record.remainingDays}</Text>
          <Text style={styles.balanceStatLabel}>คงเหลือ</Text>
        </View>
      </View>
    </View>
  );
}

function RequestRow({ record }: { record: LeaveRequestRecord }) {
  const statusColor = leaveStatusColor(record.status);
  return (
    <View style={styles.requestRow}>
      <View style={styles.requestLeft}>
        <Text style={styles.requestType}>{leaveTypeLabel(record.leaveType)}</Text>
        <Text style={styles.requestDates}>
          {formatShortDate(record.startDate)} — {formatShortDate(record.endDate)}
        </Text>
        {record.reason ? (
          <Text style={styles.requestReason} numberOfLines={1}>{record.reason}</Text>
        ) : null}
        <Text style={styles.requestDays}>{record.totalDays} วัน</Text>
      </View>
      <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
        <Text style={[styles.statusBadgeText, { color: statusColor }]}>
          {leaveStatusLabel(record.status)}
        </Text>
      </View>
    </View>
  );
}

interface LeaveFormState {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
}

interface FormErrors {
  leaveType?: string;
  startDate?: string;
  endDate?: string;
  reason?: string;
}

function LeaveForm({
  onSubmit,
  submitState,
  submitError,
  submitMessage,
  onReset,
}: {
  onSubmit: (values: LeaveFormState) => void;
  submitState: 'idle' | 'submitting' | 'success' | 'error';
  submitError: string | null;
  submitMessage: string | null;
  onReset: () => void;
}) {
  const [form, setForm] = useState<LeaveFormState>({
    leaveType: 'SICK',
    startDate: '',
    endDate: '',
    reason: '',
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const isSubmitting = submitState === 'submitting';
  const leaveDays = calculateLeaveDays(form.startDate, form.endDate);

  function validate(): boolean {
    const errs: FormErrors = {};

    if (!form.leaveType) errs.leaveType = 'กรุณาเลือกประเภทการลา';
    if (!form.startDate) {
      errs.startDate = 'กรุณากรอกวันที่เริ่มต้น';
    } else if (!validateDateFormat(form.startDate)) {
      errs.startDate = 'กรุณากรอกวันที่ในรูปแบบ YYYY-MM-DD';
    }
    if (!form.endDate) {
      errs.endDate = 'กรุณากรอกวันที่สิ้นสุด';
    } else if (!validateDateFormat(form.endDate)) {
      errs.endDate = 'กรุณากรอกวันที่ในรูปแบบ YYYY-MM-DD';
    }
    if (!errs.startDate && !errs.endDate && form.startDate && form.endDate) {
      if (new Date(form.startDate) > new Date(form.endDate)) {
        errs.endDate = 'วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น';
      }
    }
    if (!form.reason.trim()) errs.reason = 'กรุณากรอกเหตุผลการลา';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    onSubmit(form);
  }

  function handleClear() {
    setForm({ leaveType: 'SICK', startDate: '', endDate: '', reason: '' });
    setErrors({});
    onReset();
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>ขออนุมัติลา</Text>

      {/* Leave type selector */}
      <View>
        <Text style={styles.fieldLabel}>ประเภทการลา</Text>
        <View style={styles.typeRow}>
          {LEAVE_TYPE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={({ pressed }) => [
                styles.typeBtn,
                form.leaveType === opt.value && styles.typeBtnActive,
                pressed && styles.pressed,
              ]}
              onPress={() => setForm((f) => ({ ...f, leaveType: opt.value }))}
            >
              <Text
                style={[
                  styles.typeBtnText,
                  form.leaveType === opt.value && styles.typeBtnTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {errors.leaveType ? <Text style={styles.fieldError}>{errors.leaveType}</Text> : null}
      </View>

      {/* Start date */}
      <DatePickerField
        label="วันที่เริ่มต้น"
        value={form.startDate}
        onChange={(v) => setForm((f) => ({ ...f, startDate: v }))}
        error={errors.startDate}
        disabled={isSubmitting}
      />

      {/* End date */}
      <DatePickerField
        label="วันที่สิ้นสุด"
        value={form.endDate}
        onChange={(v) => setForm((f) => ({ ...f, endDate: v }))}
        error={errors.endDate}
        disabled={isSubmitting}
      />

      <View style={styles.leaveDaysPreview}>
        <Text style={styles.leaveDaysPreviewLabel}>จำนวนวันที่ลา</Text>
        <Text style={styles.leaveDaysPreviewValue}>
          {leaveDays ? `${leaveDays} วัน` : 'เลือกช่วงวันที่เพื่อคำนวณ'}
        </Text>
      </View>

      {/* Reason */}
      <View>
        <Text style={styles.fieldLabel}>เหตุผลการลา</Text>
        <TextInput
          style={[styles.input, styles.inputMultiline, errors.reason ? styles.inputError : undefined]}
          placeholder="ระบุเหตุผลการลา"
          placeholderTextColor="#9ca3af"
          value={form.reason}
          onChangeText={(v) => setForm((f) => ({ ...f, reason: v }))}
          multiline
          numberOfLines={3}
          maxLength={500}
          editable={!isSubmitting}
        />
        {errors.reason ? <Text style={styles.fieldError}>{errors.reason}</Text> : null}
      </View>

      {/* Submit error */}
      {submitError ? (
        <View style={styles.submitErrorBox}>
          <Text style={styles.submitErrorText}>{submitError}</Text>
        </View>
      ) : null}

      {/* Submit success */}
      {submitMessage ? (
        <View style={styles.submitSuccessBox}>
          <Text style={styles.submitSuccessText}>{submitMessage}</Text>
        </View>
      ) : null}

      {/* Buttons */}
      <View style={styles.formBtnRow}>
        <Pressable
          style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
          onPress={handleClear}
          disabled={isSubmitting}
        >
          <Text style={styles.clearBtnText}>ล้างข้อมูล</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.submitBtn,
            isSubmitting && styles.disabled,
            pressed && !isSubmitting && styles.pressed,
          ]}
          onPress={handleSubmit}
          disabled={isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="ส่งคำขอลา"
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : null}
          <Text style={styles.submitBtnText}>
            {isSubmitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอลา'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function LeaveScreen() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useAuth();
  const {
    loadState,
    requests,
    balances,
    error,
    submitState,
    submitError,
    submitMessage,
    refresh,
    submitRequest,
    resetSubmit,
  } = useLeave();

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
  const canApprove = canUseManagerApproval(user?.role ?? '');

  async function handleSubmit(values: { leaveType: LeaveType; startDate: string; endDate: string; reason: string }) {
    await submitRequest({
      leaveType: values.leaveType,
      startDate: values.startDate,
      endDate: values.endDate,
      reason: values.reason,
    });
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <MobileScreenHeader
        title="Leave"
        subtitle="จัดการสิทธิ์ลาและส่งคำขอ"
        backHref="/home"
        action={
          canApprove ? (
            <Pressable
              style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
              onPress={() => router.push('/approvals')}
              accessibilityRole="button"
            >
              <Text style={styles.headerActionText}>Approvals</Text>
            </Pressable>
          ) : undefined
        }
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#1a56db" />
        }
      >
        {/* ── Load state ───────────────────────────────────────────────── */}
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

        {/* ── Leave Balance ────────────────────────────────────────────── */}
        {(loadState === 'success' || loadState === 'idle') && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>สิทธิ์การลา</Text>
            {balances.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>ไม่พบข้อมูลสิทธิ์การลา</Text>
              </View>
            ) : (
              balances.map((b) => <BalanceRow key={b.id} record={b} />)
            )}
          </View>
        )}

        {/* ── Create Leave Request Form ─────────────────────────────────── */}
        <LeaveForm
          onSubmit={handleSubmit}
          submitState={submitState}
          submitError={submitError}
          submitMessage={submitMessage}
          onReset={resetSubmit}
        />

        {/* ── My Leave Requests ─────────────────────────────────────────── */}
        {(loadState === 'success' || loadState === 'idle') && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>คำขอลาของฉัน</Text>
            {requests.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>ไม่พบคำขอลา</Text>
              </View>
            ) : (
              requests.map((r) => <RequestRow key={r.id} record={r} />)
            )}
          </View>
        )}

      </ScrollView>
      <MobileBottomNav />
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
    gap: 16,
    paddingBottom: 24,
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

  // Balance row
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  balanceLeft: {
    gap: 2,
  },
  balanceType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  balanceYear: {
    fontSize: 12,
    color: '#9ca3af',
  },
  balanceRight: {
    flexDirection: 'row',
    gap: 16,
  },
  balanceStat: {
    alignItems: 'center',
    gap: 2,
  },
  balanceStatValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  balanceStatLabel: {
    fontSize: 10,
    color: '#6b7280',
  },

  // Request row
  requestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  requestLeft: {
    flex: 1,
    gap: 3,
    paddingRight: 12,
  },
  requestType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  requestDates: {
    fontSize: 12,
    color: '#6b7280',
  },
  requestReason: {
    fontSize: 12,
    color: '#374151',
  },
  requestDays: {
    fontSize: 11,
    color: '#9ca3af',
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '600',
  },

  // Form
  fieldLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 6,
  },
  fieldError: {
    fontSize: 12,
    color: '#dc2626',
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#ffffff',
  },
  inputError: {
    borderColor: '#f87171',
  },
  dateBtn: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateBtnText: {
    fontSize: 14,
    color: '#111827',
  },
  dateBtnPlaceholder: {
    fontSize: 14,
    color: '#9ca3af',
  },
  calendarIcon: {
    fontSize: 16,
  },
  leaveDaysPreview: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbeafe',
    backgroundColor: '#f8fbff',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  leaveDaysPreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1d4ed8',
  },
  leaveDaysPreviewValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeBtn: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#f9fafb',
  },
  typeBtnActive: {
    borderColor: '#1a56db',
    backgroundColor: '#eff6ff',
  },
  typeBtnText: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  typeBtnTextActive: {
    color: '#1a56db',
    fontWeight: '600',
  },
  formBtnRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  clearBtn: {
    flexGrow: 1,
    flexBasis: 120,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  clearBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  submitBtn: {
    flexGrow: 2,
    flexBasis: 180,
    backgroundColor: '#1a56db',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },
  submitErrorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  submitErrorText: {
    fontSize: 12,
    color: '#dc2626',
    textAlign: 'center',
    lineHeight: 18,
  },
  submitSuccessBox: {
    backgroundColor: '#f0fdf4',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  submitSuccessText: {
    fontSize: 12,
    color: '#16a34a',
    textAlign: 'center',
    lineHeight: 18,
  },

  // Empty state
  emptyBox: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  emptyText: {
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

  headerAction: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  headerActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1a56db',
  },

  // Shared
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.55 },
});
