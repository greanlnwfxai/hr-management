import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import { getGeofenceLocation } from '../api/client';
import { useDeviceLocation } from '../hooks/useDeviceLocation';
import type { GeofenceLocation } from '../api/types';
import type { DeviceLocation } from '../hooks/useDeviceLocation';

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
  const mapRef = useRef<MapView>(null);
  const { getLocation } = useDeviceLocation();

  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [geofence, setGeofence] = useState<GeofenceLocation | null>(null);
  const [userLocation, setUserLocation] = useState<DeviceLocation | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoadState('loading');
    setErrorMsg(null);

    void (async () => {
      try {
        const [geo, loc] = await Promise.all([
          getGeofenceLocation(token),
          getLocation(),
        ]);

        setGeofence(geo);
        setUserLocation(loc);

        if (!geo.latitude || !geo.longitude) {
          setLoadState('no-config');
          return;
        }

        setLoadState('ready');

        const midLat = (geo.latitude + loc.latitude) / 2;
        const midLng = (geo.longitude + loc.longitude) / 2;
        const latDelta = Math.max(Math.abs(geo.latitude - loc.latitude) * 2.5, 0.005);
        const lngDelta = Math.max(Math.abs(geo.longitude - loc.longitude) * 2.5, 0.005);

        setTimeout(() => {
          mapRef.current?.animateToRegion(
            { latitude: midLat, longitude: midLng, latitudeDelta: latDelta, longitudeDelta: lngDelta },
            500,
          );
        }, 300);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
        setLoadState('error');
      }
    })();
  }, [visible]);

  const initialRegion: Region = geofence?.latitude && geofence?.longitude
    ? {
        latitude: geofence.latitude,
        longitude: geofence.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }
    : { latitude: 13.7563, longitude: 100.5018, latitudeDelta: 0.01, longitudeDelta: 0.01 };

  const confirmLabel = action === 'in' ? 'ยืนยันเช็คอิน' : 'ยืนยันเช็คเอาท์';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {action === 'in' ? 'เช็คอิน' : 'เช็คเอาท์'} — ตรวจสอบตำแหน่ง
            </Text>
            <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" accessibilityLabel="ปิด">
              <Text style={styles.headerClose}>✕</Text>
            </Pressable>
          </View>

          {/* Map area */}
          <View style={styles.mapContainer}>
            {loadState === 'loading' && (
              <View style={styles.mapCenter}>
                <ActivityIndicator color="#1a56db" size="large" />
                <Text style={styles.mapCenterText}>กำลังโหลดแผนที่...</Text>
              </View>
            )}

            {loadState === 'error' && (
              <View style={styles.mapCenter}>
                <Text style={styles.mapCenterError}>{errorMsg}</Text>
              </View>
            )}

            {loadState === 'no-config' && (
              <View style={styles.mapCenter}>
                <Text style={styles.mapCenterIcon}>📍</Text>
                <Text style={styles.mapCenterText}>ยังไม่ได้ตั้งค่าตำแหน่งบริษัท</Text>
                <Text style={styles.mapCenterSub}>ติดต่อ HR เพื่อตั้งค่า geofence</Text>
              </View>
            )}

            {loadState === 'ready' && (
              Platform.OS !== 'web' && geofence?.latitude && geofence?.longitude ? (
                <MapView
                  ref={mapRef}
                  style={styles.map}
                  initialRegion={initialRegion}
                  showsUserLocation
                  showsMyLocationButton={false}
                >
                  <Marker
                    coordinate={{ latitude: geofence.latitude, longitude: geofence.longitude }}
                    title="บริษัท"
                    pinColor="#dc2626"
                  />
                  <Circle
                    center={{ latitude: geofence.latitude, longitude: geofence.longitude }}
                    radius={geofence.radiusMeters}
                    strokeColor="rgba(220,38,38,0.8)"
                    strokeWidth={2}
                    fillColor="rgba(220,38,38,0.12)"
                  />
                </MapView>
              ) : (
                <View style={styles.mapCenter}>
                  <Text style={styles.mapCenterIcon}>📍</Text>
                  <Text style={styles.mapCenterText}>ตรวจสอบตำแหน่งสำเร็จ</Text>
                  <Text style={styles.mapCenterSub}>กดยืนยันเพื่อลงเวลา</Text>
                </View>
              )
            )}
          </View>

          {/* Legend — native only; map does not render on web */}
          {loadState === 'ready' && Platform.OS !== 'web' && (
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#dc2626' }]} />
                <Text style={styles.legendText}>ที่ตั้งบริษัท</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#3b82f6' }]} />
                <Text style={styles.legendText}>ตำแหน่งของคุณ</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={styles.legendCircle} />
                <Text style={styles.legendText}>รัศมี {geofence?.radiusMeters ?? 100} ม.</Text>
              </View>
            </View>
          )}

          {/* Buttons */}
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
  mapContainer: {
    height: 320,
    backgroundColor: '#f3f4f6',
  },
  map: { flex: 1 },
  mapCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    padding: 24,
  },
  mapCenterText: { fontSize: 14, color: '#374151', textAlign: 'center' },
  mapCenterSub: { fontSize: 12, color: '#9ca3af', textAlign: 'center' },
  mapCenterError: { fontSize: 14, color: '#dc2626', textAlign: 'center' },
  mapCenterIcon: { fontSize: 32 },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendCircle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: 'rgba(220,38,38,0.8)',
    backgroundColor: 'rgba(220,38,38,0.12)',
  },
  legendText: { fontSize: 12, color: '#6b7280' },
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
