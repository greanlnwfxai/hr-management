import React, { Component, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Circle, CircleMarker, MapContainer, TileLayer, useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';
import { getGeofenceLocation } from '../api/client';
import { useDeviceLocation } from '../hooks/useDeviceLocation';
import type { GeofenceLocation } from '../api/types';
import type { DeviceLocation } from '../hooks/useDeviceLocation';
import { haversineMeters } from '../utils/haversine';

export type ClockAction = 'in' | 'out';

interface GeofenceMapModalProps {
  visible: boolean;
  action: ClockAction;
  token: string;
  onConfirm: () => void;
  onCancel: () => void;
}

type LoadState = 'loading' | 'ready' | 'no-config' | 'error';

interface EBState { hasError: boolean }
class MapErrorBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  EBState
> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError(): EBState { return { hasError: true }; }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

interface MapSetupProps {
  lat: number;
  lng: number;
  userLocation: DeviceLocation | null;
}

function MapSetup({ lat, lng, userLocation }: MapSetupProps) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
      if (userLocation) {
        const bounds: LatLngBoundsExpression = [
          [Math.min(lat, userLocation.latitude), Math.min(lng, userLocation.longitude)],
          [Math.max(lat, userLocation.latitude), Math.max(lng, userLocation.longitude)],
        ];
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 17 });
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [map, lat, lng, userLocation]);
  return null;
}

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
  const [userLocation, setUserLocation] = useState<DeviceLocation | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!visible) return;
    setLoadState('loading');
    setErrorMsg(null);
    setUserLocation(null);
    setLocationError(null);
    setMapKey(k => k + 1);

    void (async () => {
      try {
        const geo = await getGeofenceLocation(token);

        // User location is best-effort — failure never blocks the map
        getLocation().then(setUserLocation).catch((err: unknown) => {
          setLocationError(
            err instanceof Error ? err.message : 'ไม่สามารถระบุตำแหน่งของคุณได้',
          );
        });

        if (!geo.latitude || !geo.longitude) {
          setGeofence(geo);
          setLoadState('no-config');
          return;
        }

        setGeofence(geo);
        setLoadState('ready');
      } catch (err) {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : 'ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง',
        );
        setLoadState('error');
      }
    })();
  }, [visible]);

  const distanceMeters =
    geofence?.latitude && geofence?.longitude && userLocation
      ? Math.round(haversineMeters(geofence.latitude, geofence.longitude, userLocation.latitude, userLocation.longitude))
      : null;

  const isInsideRadius: boolean | null =
    distanceMeters !== null ? distanceMeters <= (geofence?.radiusMeters ?? 100) : null;

  const circleColor = isInsideRadius === true ? '#16a34a' : '#dc2626';
  const confirmDisabled = loadState === 'loading' || isInsideRadius === false;
  const confirmLabel = action === 'in' ? 'ยืนยันเช็คอิน' : 'ยืนยันเช็คเอาท์';

  const mapFallback = (
    <View style={styles.center}>
      <Text style={styles.centerIcon}>📍</Text>
      <Text style={styles.centerText}>ตรวจสอบตำแหน่งสำเร็จ</Text>
      {!!geofence?.radiusMeters && (
        <Text style={styles.centerSub}>รัศมีที่อนุญาต {geofence.radiusMeters} เมตร</Text>
      )}
      <Text style={styles.centerSub}>กดยืนยันเพื่อลงเวลา</Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>

          {/* Fixed header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {action === 'in' ? 'เช็คอิน' : 'เช็คเอาท์'} — ตรวจสอบตำแหน่ง
            </Text>
            <Pressable onPress={onCancel} hitSlop={12} accessibilityRole="button" accessibilityLabel="ปิด">
              <Text style={styles.headerClose}>✕</Text>
            </Pressable>
          </View>

          {/* Scrollable body — shrinks when viewport is constrained */}
          <ScrollView style={styles.body} bounces={false} showsVerticalScrollIndicator={false}>

            <View style={styles.mapArea}>
              {loadState === 'loading' && (
                <View style={styles.center}>
                  <ActivityIndicator color="#1a56db" size="large" />
                  <Text style={styles.centerText}>กำลังโหลดแผนที่...</Text>
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

              {loadState === 'ready' && mounted && geofence?.latitude && geofence?.longitude && (
                <MapErrorBoundary key={mapKey} fallback={mapFallback}>
                  <MapContainer
                    center={[geofence.latitude, geofence.longitude]}
                    zoom={17}
                    style={{ width: '100%', height: '100%' }}
                    zoomControl
                    scrollWheelZoom={false}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    <MapSetup
                      lat={geofence.latitude}
                      lng={geofence.longitude}
                      userLocation={userLocation}
                    />
                    <Circle
                      center={[geofence.latitude, geofence.longitude]}
                      radius={geofence.radiusMeters}
                      pathOptions={{
                        color: circleColor,
                        fillColor: circleColor,
                        fillOpacity: 0.12,
                        weight: 2,
                      }}
                    />
                    <CircleMarker
                      center={[geofence.latitude, geofence.longitude]}
                      radius={9}
                      pathOptions={{ color: '#dc2626', fillColor: '#dc2626', fillOpacity: 1, weight: 2 }}
                    />
                    {userLocation && (
                      <CircleMarker
                        center={[userLocation.latitude, userLocation.longitude]}
                        radius={9}
                        pathOptions={{ color: '#1a56db', fillColor: '#1a56db', fillOpacity: 1, weight: 2 }}
                      />
                    )}
                  </MapContainer>
                </MapErrorBoundary>
              )}
            </View>

            {loadState === 'ready' && (
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#dc2626' }]} />
                  <Text style={styles.legendText}>ที่ตั้งบริษัท</Text>
                </View>
                {userLocation && (
                  <View style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: '#1a56db' }]} />
                    <Text style={styles.legendText}>ตำแหน่งปัจจุบัน</Text>
                  </View>
                )}
                <View style={styles.legendItem}>
                  <View style={[
                    styles.legendCircle,
                    {
                      borderColor: isInsideRadius === true ? 'rgba(22,163,74,0.8)' : 'rgba(220,38,38,0.8)',
                      backgroundColor: isInsideRadius === true ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
                    },
                  ]} />
                  <Text style={styles.legendText}>รัศมีที่อนุญาต {geofence?.radiusMeters ?? 100} เมตร</Text>
                </View>
                {locationError && !userLocation && (
                  <Text style={styles.locationNotice}>{locationError}</Text>
                )}
              </View>
            )}

            {loadState === 'ready' && isInsideRadius !== null && (
              <View style={[styles.statusBanner, isInsideRadius ? styles.statusBannerIn : styles.statusBannerOut]}>
                <Text style={[styles.statusText, isInsideRadius ? styles.statusTextIn : styles.statusTextOut]}>
                  {isInsideRadius ? '✅ คุณอยู่ในพื้นที่ลงเวลา' : '⚠️ คุณอยู่นอกพื้นที่ลงเวลา'}
                </Text>
                <Text style={styles.statusSub}>ระยะห่างจากบริษัท {distanceMeters} เมตร</Text>
              </View>
            )}

          </ScrollView>

          {/* Fixed footer — always visible, never scrolled away */}
          <View style={styles.footer}>
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
                confirmDisabled && styles.btnDisabled,
                pressed && !confirmDisabled && { opacity: 0.85 },
              ]}
              onPress={onConfirm}
              disabled={confirmDisabled}
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
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '92%',
    maxWidth: 700,
    maxHeight: '88%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 8,
  },
  header: {
    flexShrink: 0,
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
  // Scrollable body shrinks when the sheet is height-constrained so the
  // fixed footer always remains visible.
  body: {
    flexShrink: 1,
  },
  mapArea: {
    height: 260,
    backgroundColor: '#e5e7eb',
    overflow: 'hidden',
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
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
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
  locationNotice: { fontSize: 11, color: '#d97706', width: '100%' },
  statusBanner: {
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 4,
  },
  statusBannerIn: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#bbf7d0' },
  statusBannerOut: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa' },
  statusText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  statusTextIn: { color: '#16a34a' },
  statusTextOut: { color: '#dc2626' },
  statusSub: { fontSize: 13, color: '#6b7280', textAlign: 'center' },
  // Fixed footer — sits outside the ScrollView so it is never scrolled off screen.
  footer: {
    flexShrink: 0,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
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
