import { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/auth/useAuth';
import { useApprovals } from '../src/hooks/useApprovals';
import { canUseManagerApproval } from '../src/utils/roles';
import { leaveTypeLabel, leaveStatusLabel, leaveStatusColor } from '../src/hooks/useLeave';
import type { LeaveRequestRecord } from '../src/api/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
}

// ─── Leave Request Card ───────────────────────────────────────────────────────

function LeaveCard({
  record,
  actionLoadingId,
  onApprove,
  onReject,
}: {
  record: LeaveRequestRecord;
  actionLoadingId: string | null;
  onApprove: (id: string, name: string) => void;
  onReject: (id: string) => void;
}) {
  const isBusy = actionLoadingId === record.id;
  const anyBusy = actionLoadingId !== null;
  const statusColor = leaveStatusColor(record.status);
  const empName = `${record.employee.firstName} ${record.employee.lastName}`;

  return (
    <View style={styles.leaveCard}>
      {/* Header row */}
      <View style={styles.cardHeader}>
        <View style={styles.empInfo}>
          <Text style={styles.empName}>{empName}</Text>
          <Text style={styles.empCode}>{record.employee.employeeCode}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>
            {leaveStatusLabel(record.status)}
          </Text>
        </View>
      </View>

      {/* Details */}
      <View style={styles.detailRow}>
        <Text style={styles.leaveType}>{leaveTypeLabel(record.leaveType)}</Text>
        <Text style={styles.leaveDays}>{record.totalDays} วัน</Text>
      </View>
      <Text style={styles.leaveDates}>
        {formatShortDate(record.startDate)} — {formatShortDate(record.endDate)}
      </Text>
      {record.reason ? (
        <Text style={styles.leaveReason} numberOfLines={2}>{record.reason}</Text>
      ) : null}
      <Text style={styles.submittedAt}>
        ส่งเมื่อ {formatShortDate(record.createdAt)}
      </Text>

      {/* Actions */}
      {record.status === 'PENDING' && (
        <View style={styles.actionRow}>
          <Pressable
            style={({ pressed }) => [
              styles.rejectBtn,
              (anyBusy || pressed) && styles.pressed,
              anyBusy && styles.disabled,
            ]}
            onPress={() => onReject(record.id)}
            disabled={anyBusy}
            accessibilityRole="button"
            accessibilityLabel="ปฏิเสธ"
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#dc2626" />
            ) : (
              <Text style={styles.rejectBtnText}>ปฏิเสธ</Text>
            )}
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.approveBtn,
              (anyBusy || pressed) && styles.pressed,
              anyBusy && styles.disabled,
            ]}
            onPress={() => onApprove(record.id, empName)}
            disabled={anyBusy}
            accessibilityRole="button"
            accessibilityLabel="อนุมัติ"
          >
            {isBusy ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.approveBtnText}>อนุมัติ</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Approve Confirm Modal ────────────────────────────────────────────────────

function ApproveModal({
  visible,
  empName,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  empName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.modalOverlay} onPress={onCancel}>
        <Pressable style={styles.modalBox} onPress={() => {}}>
          <Text style={styles.modalTitle}>ยืนยันการอนุมัติ</Text>
          <Text style={styles.modalBody}>อนุมัติคำขอลาของ {empName}?</Text>
          <View style={styles.modalActions}>
            <Pressable
              style={({ pressed }) => [styles.modalCancelBtn, pressed && styles.pressed]}
              onPress={onCancel}
              accessibilityRole="button"
              accessibilityLabel="ยกเลิก"
            >
              <Text style={styles.modalCancelText}>ยกเลิก</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.modalApproveBtn, pressed && styles.pressed]}
              onPress={onConfirm}
              accessibilityRole="button"
              accessibilityLabel="ยืนยันการอนุมัติ"
            >
              <Text style={styles.modalConfirmText}>อนุมัติ</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Reject Modal ─────────────────────────────────────────────────────────────

function RejectModal({
  visible,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');

  function handleConfirm() {
    onConfirm(reason.trim());
    setReason('');
  }

  function handleCancel() {
    setReason('');
    onCancel();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <Pressable style={styles.modalOverlay} onPress={handleCancel}>
        <Pressable style={styles.modalBox} onPress={() => {}}>
          <Text style={styles.modalTitle}>เหตุผลการปฏิเสธ</Text>
          <TextInput
            style={styles.reasonInput}
            placeholder="ระบุเหตุผล (ไม่บังคับ)"
            placeholderTextColor="#9ca3af"
            value={reason}
            onChangeText={setReason}
            multiline
            numberOfLines={3}
            maxLength={500}
            textAlignVertical="top"
            autoFocus
          />
          <View style={styles.modalActions}>
            <Pressable
              style={({ pressed }) => [styles.modalCancelBtn, pressed && styles.pressed]}
              onPress={handleCancel}
              accessibilityRole="button"
              accessibilityLabel="ยกเลิก"
            >
              <Text style={styles.modalCancelText}>ยกเลิก</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.modalConfirmBtn, pressed && styles.pressed]}
              onPress={handleConfirm}
              accessibilityRole="button"
              accessibilityLabel="ยืนยันการปฏิเสธ"
            >
              <Text style={styles.modalConfirmText}>ยืนยันการปฏิเสธ</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ApprovalsScreen() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const role = user?.role ?? '';
  const hasAccess = canUseManagerApproval(role);

  const { loadState, requests, error, actionLoadingId, refresh, approve, reject } = useApprovals(hasAccess);

  const [rejectTargetId, setRejectTargetId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<{ id: string; empName: string } | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const isRefreshing = loadState === 'loading';

  useEffect(() => {
    if (!isLoading && user?.mustChangePassword) {
      router.replace('/profile');
    }
  }, [isLoading, user?.mustChangePassword]);

  // Access denied for EMPLOYEE
  if (!isLoading && !hasAccess) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.fullCenter}>
          <Text style={styles.accessDeniedIcon}>🚫</Text>
          <Text style={styles.accessDeniedText}>คุณไม่มีสิทธิ์เข้าถึงฟีเจอร์นี้</Text>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            onPress={() => router.replace('/home')}
            accessibilityRole="button"
            accessibilityLabel="กลับหน้าหลัก"
          >
            <Text style={styles.backBtnText}>กลับหน้าหลัก</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  function handleApprove(id: string, empName: string) {
    setFeedbackMsg(null);
    setApproveTarget({ id, empName });
  }

  async function handleApproveConfirm() {
    if (!approveTarget) return;
    const { id } = approveTarget;
    setApproveTarget(null);
    try {
      await approve(id);
      setFeedbackMsg({ type: 'success', text: 'อนุมัติคำขอลาเรียบร้อยแล้ว' });
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'ไม่สามารถอนุมัติคำขอได้',
      });
    }
  }

  function handleRejectOpen(id: string) {
    setFeedbackMsg(null);
    setRejectTargetId(id);
  }

  async function handleRejectConfirm(reason: string) {
    if (!rejectTargetId) return;
    const id = rejectTargetId;
    setRejectTargetId(null);
    try {
      await reject(id, reason);
      setFeedbackMsg({ type: 'success', text: 'ปฏิเสธคำขอลาเรียบร้อยแล้ว' });
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'ไม่สามารถปฏิเสธคำขอได้',
      });
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <ApproveModal
        visible={approveTarget !== null}
        empName={approveTarget?.empName ?? ''}
        onConfirm={handleApproveConfirm}
        onCancel={() => setApproveTarget(null)}
      />
      <RejectModal
        visible={rejectTargetId !== null}
        onConfirm={handleRejectConfirm}
        onCancel={() => setRejectTargetId(null)}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor="#1a56db" />
        }
      >
        {/* ── Page header ──────────────────────────────────────────────── */}
        <View style={styles.pageHeader}>
          <Pressable
            style={({ pressed }) => [styles.backLink, pressed && styles.pressed]}
            onPress={() => router.replace('/home')}
            accessibilityRole="button"
            accessibilityLabel="กลับ"
          >
            <Text style={styles.backLinkText}>← กลับ</Text>
          </Pressable>
          <Text style={styles.pageTitle}>อนุมัติคำขอลา</Text>
        </View>

        {/* ── Inline feedback banner ───────────────────────────────────── */}
        {feedbackMsg && (
          <Pressable
            style={[
              styles.feedbackBanner,
              feedbackMsg.type === 'success' ? styles.feedbackSuccess : styles.feedbackError,
            ]}
            onPress={() => setFeedbackMsg(null)}
            accessibilityRole="button"
            accessibilityLabel="ปิดการแจ้งเตือน"
          >
            <Text style={styles.feedbackText}>{feedbackMsg.text}</Text>
          </Pressable>
        )}

        {/* ── Load state ───────────────────────────────────────────────── */}
        {loadState === 'loading' && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#1a56db" size="small" />
            <Text style={styles.loadingText}>กำลังโหลดข้อมูล...</Text>
          </View>
        )}

        {loadState === 'error' && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error ?? 'ไม่สามารถโหลดข้อมูลได้'}</Text>
            <Pressable
              style={({ pressed }) => [styles.retryBtn, pressed && styles.pressed]}
              onPress={refresh}
              accessibilityRole="button"
              accessibilityLabel="ลองใหม่อีกครั้ง"
            >
              <Text style={styles.retryText}>ลองใหม่อีกครั้ง</Text>
            </Pressable>
          </View>
        )}

        {/* ── Pending requests ─────────────────────────────────────────── */}
        {(loadState === 'success' || loadState === 'idle') && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>คำขอรออนุมัติ</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{requests.length}</Text>
              </View>
            </View>

            {requests.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyIcon}>✅</Text>
                <Text style={styles.emptyText}>ไม่มีคำขอที่รออนุมัติ</Text>
              </View>
            ) : (
              requests.map((r) => (
                <LeaveCard
                  key={r.id}
                  record={r}
                  actionLoadingId={actionLoadingId}
                  onApprove={handleApprove}
                  onReject={handleRejectOpen}
                />
              ))
            )}
          </>
        )}

        {/* ── Refresh button ───────────────────────────────────────────── */}
        <Pressable
          style={({ pressed }) => [
            styles.refreshBtn,
            pressed && styles.pressed,
            isRefreshing && styles.disabled,
          ]}
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
    paddingBottom: 40,
  },
  fullCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 32,
  },

  // Access denied
  accessDeniedIcon: {
    fontSize: 48,
  },
  accessDeniedText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    textAlign: 'center',
  },
  backBtn: {
    marginTop: 8,
    backgroundColor: '#1a56db',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Page header
  pageHeader: {
    gap: 8,
    marginBottom: 4,
  },
  backLink: {
    alignSelf: 'flex-start',
  },
  backLinkText: {
    fontSize: 13,
    color: '#1a56db',
    fontWeight: '500',
  },
  pageTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },

  // Feedback banner
  feedbackBanner: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  feedbackSuccess: {
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  feedbackError: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  feedbackText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111827',
    textAlign: 'center',
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  countBadge: {
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#92400e',
  },

  // Leave card
  leaveCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  empInfo: {
    flex: 1,
    gap: 2,
    paddingRight: 8,
  },
  empName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  empCode: {
    fontSize: 12,
    color: '#6b7280',
  },
  statusBadge: {
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leaveType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a56db',
  },
  leaveDays: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  leaveDates: {
    fontSize: 13,
    color: '#374151',
  },
  leaveReason: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },
  submittedAt: {
    fontSize: 11,
    color: '#9ca3af',
  },

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 10,
  },
  rejectBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#fca5a5',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  rejectBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
  },
  approveBtn: {
    flex: 2,
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  approveBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Modal shared
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  modalBody: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  reasonInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    minHeight: 88,
    backgroundColor: '#f9fafb',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  modalApproveBtn: {
    flex: 2,
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalConfirmBtn: {
    flex: 2,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ffffff',
  },

  // Empty state
  emptyBox: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  emptyIcon: {
    fontSize: 36,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },

  // Loading / error
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 24,
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
