import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useProfile } from '../src/hooks/useProfile';
import { roleLabel } from '../src/utils/roles';

interface Banner {
  type: 'success' | 'error';
  message: string;
}

function PasswordInput({
  label,
  value,
  onChangeText,
  show,
  onToggleShow,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  show: boolean;
  onToggleShow: () => void;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          style={styles.textInput}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!show}
          autoCapitalize="none"
          autoCorrect={false}
          placeholderTextColor="#9ca3af"
          placeholder="••••••••"
        />
        <Pressable
          style={styles.eyeBtn}
          onPress={onToggleShow}
          accessibilityRole="button"
          accessibilityLabel={show ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
        >
          <Text style={styles.eyeText}>{show ? '🙈' : '👁'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { loadState, profile, error, actionLoading, refresh, changePassword } = useProfile();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  const passwordRulesOk = {
    minLength: newPassword.length >= 8,
    hasUpper: /[A-Z]/.test(newPassword),
    hasLower: /[a-z]/.test(newPassword),
    hasDigit: /[0-9]/.test(newPassword),
    hasSpecial: /[!@#$%^&*]/.test(newPassword),
  };

  const passwordValid = Object.values(passwordRulesOk).every(Boolean);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const canSubmit =
    currentPassword.length > 0 &&
    passwordValid &&
    passwordsMatch &&
    !actionLoading;

  const handleChangePassword = async () => {
    setBanner(null);
    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      setBanner({ type: 'success', message: 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setBanner({
        type: 'error',
        message: err instanceof Error ? err.message : 'เปลี่ยนรหัสผ่านไม่สำเร็จ',
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="กลับ"
          >
            <Text style={styles.backBtnText}>← กลับ</Text>
          </Pressable>
          <Text style={styles.pageTitle}>โปรไฟล์ของฉัน</Text>
        </View>

        {/* ── Loading state ────────────────────────────────────────────── */}
        {loadState === 'loading' && (
          <View style={styles.centerBox}>
            <ActivityIndicator color="#1a56db" size="large" />
            <Text style={styles.loadingText}>กำลังโหลดข้อมูล...</Text>
          </View>
        )}

        {/* ── Error state ──────────────────────────────────────────────── */}
        {loadState === 'error' && (
          <View style={styles.card}>
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
          </View>
        )}

        {/* ── Profile info ─────────────────────────────────────────────── */}
        {loadState === 'success' && profile && (
          <>
            {/* mustChangePassword warning */}
            {profile.mustChangePassword && (
              <View style={styles.warningCard}>
                <Text style={styles.warningTitle}>⚠️ กรุณาเปลี่ยนรหัสผ่าน</Text>
                <Text style={styles.warningText}>
                  บัญชีของคุณต้องเปลี่ยนรหัสผ่านก่อนใช้งาน กรุณาเปลี่ยนรหัสผ่านด้านล่าง
                </Text>
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.sectionTitle}>ข้อมูลบัญชี</Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>อีเมล</Text>
                <Text style={styles.infoValue}>{profile.email}</Text>
              </View>

              {profile.username && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>ชื่อผู้ใช้</Text>
                  <Text style={styles.infoValue}>{profile.username}</Text>
                </View>
              )}

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>บทบาท</Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleBadgeText}>{roleLabel(profile.role)}</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>สถานะบัญชี</Text>
                <View style={profile.mustChangePassword ? styles.statusBadgeWarn : styles.statusBadgeOk}>
                  <Text style={profile.mustChangePassword ? styles.statusTextWarn : styles.statusTextOk}>
                    {profile.mustChangePassword ? 'ต้องเปลี่ยนรหัสผ่าน' : 'ปกติ'}
                  </Text>
                </View>
              </View>
            </View>

            {profile.employee && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>ข้อมูลพนักงาน</Text>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>ชื่อ-นามสกุล</Text>
                  <Text style={styles.infoValue}>
                    {profile.employee.firstName} {profile.employee.lastName}
                  </Text>
                </View>

                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>รหัสพนักงาน</Text>
                  <Text style={styles.infoValue}>{profile.employee.employeeCode}</Text>
                </View>

                {profile.employee.department && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>แผนก</Text>
                    <Text style={styles.infoValue}>{profile.employee.department}</Text>
                  </View>
                )}

                {profile.employee.position && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>ตำแหน่ง</Text>
                    <Text style={styles.infoValue}>{profile.employee.position}</Text>
                  </View>
                )}
              </View>
            )}
          </>
        )}

        {/* ── Password change section (always shown) ────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>เปลี่ยนรหัสผ่าน</Text>

          {/* Feedback banner */}
          {banner && (
            <Pressable
              onPress={() => setBanner(null)}
              style={banner.type === 'success' ? styles.bannerSuccess : styles.bannerError}
              accessibilityRole="button"
              accessibilityLabel="ปิดการแจ้งเตือน"
            >
              <Text style={banner.type === 'success' ? styles.bannerSuccessText : styles.bannerErrorText}>
                {banner.message}
              </Text>
              <Text style={styles.bannerDismiss}>✕</Text>
            </Pressable>
          )}

          <PasswordInput
            label="รหัสผ่านปัจจุบัน"
            value={currentPassword}
            onChangeText={setCurrentPassword}
            show={showCurrent}
            onToggleShow={() => setShowCurrent((v) => !v)}
          />

          <PasswordInput
            label="รหัสผ่านใหม่"
            value={newPassword}
            onChangeText={setNewPassword}
            show={showNew}
            onToggleShow={() => setShowNew((v) => !v)}
          />

          {/* Password rules */}
          {newPassword.length > 0 && (
            <View style={styles.rulesBox}>
              <PasswordRule ok={passwordRulesOk.minLength} label="อย่างน้อย 8 ตัวอักษร" />
              <PasswordRule ok={passwordRulesOk.hasUpper} label="ตัวพิมพ์ใหญ่ (A-Z)" />
              <PasswordRule ok={passwordRulesOk.hasLower} label="ตัวพิมพ์เล็ก (a-z)" />
              <PasswordRule ok={passwordRulesOk.hasDigit} label="ตัวเลข (0-9)" />
              <PasswordRule ok={passwordRulesOk.hasSpecial} label="อักขระพิเศษ (!@#$%^&*)" />
            </View>
          )}

          <PasswordInput
            label="ยืนยันรหัสผ่านใหม่"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            show={showConfirm}
            onToggleShow={() => setShowConfirm((v) => !v)}
          />

          {confirmPassword.length > 0 && !passwordsMatch && (
            <Text style={styles.mismatchText}>รหัสผ่านไม่ตรงกัน</Text>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.submitBtn,
              pressed && styles.pressed,
              !canSubmit && styles.disabled,
            ]}
            onPress={handleChangePassword}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="เปลี่ยนรหัสผ่าน"
          >
            {actionLoading ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <Text style={styles.submitBtnText}>เปลี่ยนรหัสผ่าน</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PasswordRule({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View style={styles.ruleRow}>
      <Text style={ok ? styles.ruleIconOk : styles.ruleIconFail}>{ok ? '✓' : '✗'}</Text>
      <Text style={ok ? styles.ruleLabelOk : styles.ruleLabelFail}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scroll: {
    padding: 16,
    gap: 14,
    paddingBottom: 40,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  backBtn: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#ffffff',
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
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
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingBottom: 8,
  },

  // Warning card
  warningCard: {
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400e',
  },
  warningText: {
    fontSize: 13,
    color: '#78350f',
    lineHeight: 18,
  },

  // Info rows
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 13,
    color: '#6b7280',
    flex: 1,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111827',
    flex: 2,
    textAlign: 'right',
  },
  roleBadge: {
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e40af',
  },
  statusBadgeOk: {
    backgroundColor: '#f0fdf4',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  statusTextOk: {
    fontSize: 12,
    fontWeight: '600',
    color: '#15803d',
  },
  statusBadgeWarn: {
    backgroundColor: '#fffbeb',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: '#fde68a',
  },
  statusTextWarn: {
    fontSize: 12,
    fontWeight: '600',
    color: '#92400e',
  },

  // Error box
  errorBox: {
    gap: 10,
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
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

  // Password form
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    overflow: 'hidden',
  },
  textInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#111827',
  },
  eyeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  eyeText: {
    fontSize: 16,
  },

  // Password rules
  rulesBox: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 10,
    gap: 4,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ruleIconOk: {
    fontSize: 12,
    color: '#16a34a',
    fontWeight: '700',
    width: 14,
  },
  ruleIconFail: {
    fontSize: 12,
    color: '#dc2626',
    fontWeight: '700',
    width: 14,
  },
  ruleLabelOk: {
    fontSize: 12,
    color: '#16a34a',
  },
  ruleLabelFail: {
    fontSize: 12,
    color: '#9ca3af',
  },
  mismatchText: {
    fontSize: 12,
    color: '#dc2626',
    marginTop: -4,
  },

  // Submit
  submitBtn: {
    backgroundColor: '#1a56db',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  submitBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Banners
  bannerSuccess: {
    backgroundColor: '#f0fdf4',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    gap: 8,
  },
  bannerSuccessText: {
    fontSize: 13,
    color: '#15803d',
    fontWeight: '500',
    flex: 1,
  },
  bannerError: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
    gap: 8,
  },
  bannerErrorText: {
    fontSize: 13,
    color: '#dc2626',
    fontWeight: '500',
    flex: 1,
  },
  bannerDismiss: {
    fontSize: 13,
    color: '#9ca3af',
    fontWeight: '600',
  },

  // Shared
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.45 },
});
