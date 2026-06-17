import { useState } from 'react';
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

      const result = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude, accuracy } = result.coords;
      const safeAccuracy = accuracy ?? 9999;

      return { latitude, longitude, accuracy: safeAccuracy };
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
