import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getGeofenceLocation } from '../api/client';
import { useDeviceLocation } from '../hooks/useDeviceLocation';
import type { GeofenceLocation } from '../api/types';

export type ClockAction = 'in' | 'out';

interface GeofenceMapModalProps {
  visible: boolean;
  action: ClockAction;
  token: string;
  onConfirm: () => void;
  onCancel: () => void;
}

type LoadState = 'loading' | 'ready' | 'no-config' | 'error';

export function GeofenceMapModal({
  visible,
  action,
  token,
  onConfirm,
  onCancel,
}: GeofenceMapModalProps) {
  const { getLocation } = useDeviceLocation();
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [geofence, setGeofence] = useState<GeofenceLocation | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoadState('loading');
    setErrorMsg(null);

    void (async () => {
      try {
        const [geo] = await Promise.all([
          getGeofenceLocation(token),
          getLocation(),
        ]);

        if (!geo.latitude || !geo.longitude) {
          setGeofence(geo);
          setLoadState('no-config');
          return;
        }

        setGeofence(geo);
        setLoadState('ready');
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
        setLoadState('error');
      }
    })();
  }, [visible]);

  const confirmLabel = action === 'in' ? 'ยืนยันเช็คอิน' : 'ยืนยันเช็คเอาท์';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {action === 'in' ? 'เช็คอิน' : 'เช็คเอาท์'} — ตรวจสอบตำแหน่ง
            </Text>
            <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" accessibilityLabel="ปิด">
              <Text style={styles.headerClose}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.contentArea}>
            {loadState === 'loading' && (
              <View style={styles.center}>
                <ActivityIndicator color="#1a56db" size="large" />
                <Text style={styles.centerText}>กำลังตรวจสอบตำแหน่ง...</Text>
              </View>
            )}

            {loadState === 'error' && (
              <View style={styles.center}>
                <Text style={styles.centerIcon}>⚠️</Text>
                <Text style={styles.centerError}>{errorMsg}</Text>
              </View>
            )}

            {loadState === 'no-config' && (
              <View style={styles.center}>
                <Text style={styles.centerIcon}>📍</Text>
                <Text style={styles.centerText}>ยังไม่ได้ตั้งค่าตำแหน่งบริษัท</Text>
                <Text style={styles.centerSub}>ติดต่อ HR เพื่อตั้งค่า geofence</Text>
              </View>
            )}

            {loadState === 'ready' && (
              <View style={styles.center}>
                <Text style={styles.centerIcon}>📍</Text>
                <Text style={styles.centerText}>ตรวจสอบตำแหน่งสำเร็จ</Text>
                {!!geofence?.radiusMeters && (
                  <Text style={styles.centerSub}>รัศมีที่อนุญาต {geofence.radiusMeters} เมตร</Text>
                )}
                <Text style={styles.centerSub}>กดยืนยันเพื่อลงเวลา</Text>
              </View>
            )}
          </View>

          <View style={styles.btnRow}>
            <Pressable
              style={({ pressed }) => [styles.btnCancel, pressed && { opacity: 0.7 }]}
              onPress={onCancel}
              accessibilityRole="button"
            >
              <Text style={styles.btnCancelText}>ยกเลิก</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.btnConfirm,
                action === 'out' && styles.btnConfirmOut,
                loadState === 'loading' && styles.btnDisabled,
                pressed && loadState !== 'loading' && { opacity: 0.85 },
              ]}
              onPress={onConfirm}
              disabled={loadState === 'loading'}
              accessibilityRole="button"
            >
              <Text style={styles.btnConfirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  headerClose: { fontSize: 18, color: '#6b7280', fontWeight: '500' },
  contentArea: {
    height: 200,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    padding: 24,
  },
  centerIcon: { fontSize: 40 },
  centerText: { fontSize: 15, color: '#374151', textAlign: 'center', fontWeight: '600' },
  centerSub: { fontSize: 12, color: '#9ca3af', textAlign: 'center' },
  centerError: { fontSize: 14, color: '#dc2626', textAlign: 'center' },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  btnCancel: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
  },
  btnCancelText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  btnConfirm: {
    flex: 2,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#1a56db',
  },
  btnConfirmOut: { backgroundColor: '#e05c3e' },
  btnDisabled: { opacity: 0.5 },
  btnConfirmText: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
});
