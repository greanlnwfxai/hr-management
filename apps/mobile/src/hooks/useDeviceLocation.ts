import { useState } from 'react';
import { Platform } from 'react-native';
import * as Location from 'expo-location';

export interface DeviceLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface UseDeviceLocationResult {
  getLocation: () => Promise<DeviceLocation>;
  locationLoading: boolean;
  locationError: string | null;
}

export function useDeviceLocation(): UseDeviceLocationResult {
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const getLocation = async (): Promise<DeviceLocation> => {
    setLocationLoading(true);
    setLocationError(null);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== Location.PermissionStatus.GRANTED) {
        const msg = 'กรุณาอนุญาตการเข้าถึงตำแหน่งเพื่อใช้การลงเวลาผ่านมือถือ';
        setLocationError(msg);
        throw new Error(msg);
      }

      let latitude: number;
      let longitude: number;
      let accuracy: number;

      if (Platform.OS === 'web') {
        // expo-location web hardcodes maximumAge: Infinity — bypass it with the
        // native browser API so the device must produce a fresh GPS fix.
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 15000,
          });
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        accuracy = pos.coords.accuracy ?? 9999;
      } else {
        const result = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        ({ latitude, longitude } = result.coords);
        accuracy = result.coords.accuracy ?? 9999;
      }

      return { latitude, longitude, accuracy };
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('กรุณา')) {
        throw err;
      }
      const msg = 'ไม่สามารถอ่านตำแหน่งปัจจุบันได้ กรุณาลองใหม่อีกครั้ง';
      setLocationError(msg);
      throw new Error(msg);
    } finally {
      setLocationLoading(false);
    }
  };

  return { getLocation, locationLoading, locationError };
}
