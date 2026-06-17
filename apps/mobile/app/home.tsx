import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { getHealth } from '../src/api/client';

type HealthStatus = 'idle' | 'loading' | 'ok' | 'error';

interface HealthState {
  status: HealthStatus;
  message: string;
}

const FEATURE_CARDS: Array<{ key: string; th: string; en: string }> = [
  { key: 'profile', th: 'โปรไฟล์ของฉัน', en: 'My Profile' },
  { key: 'attendance', th: 'การเข้างาน', en: 'Attendance' },
  { key: 'leave', th: 'ขอลางาน', en: 'Leave Request' },
  { key: 'dashboard', th: 'แดชบอร์ด', en: 'Dashboard' },
];

export default function HomeScreen() {
  const [health, setHealth] = useState<HealthState>({
    status: 'idle',
    message: '',
  });

  const checkHealth = async () => {
    setHealth({ status: 'loading', message: '' });
    try {
      const result = await getHealth();
      setHealth({ status: 'ok', message: `API: ${result.status}` });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Connection failed';
      setHealth({ status: 'error', message: msg });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.heading}>HR Mobile</Text>
        <Text style={styles.subheading}>ระบบบริหารทรัพยากรบุคคล</Text>

        <View style={styles.grid}>
          {FEATURE_CARDS.map((card) => (
            <View key={card.key} style={styles.card}>
              <Text style={styles.cardTh}>{card.th}</Text>
              <Text style={styles.cardEn}>{card.en}</Text>
              <View style={styles.comingSoonBadge}>
                <Text style={styles.comingSoonText}>เร็วๆ นี้</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.healthCard}>
          <Text style={styles.healthTitle}>API Health Check</Text>
          <Text style={styles.healthDesc}>
            ตรวจสอบการเชื่อมต่อกับ API Server
          </Text>

          {health.status === 'loading' && (
            <ActivityIndicator
              color="#1a56db"
              size="small"
              style={styles.indicator}
            />
          )}

          {health.status === 'ok' && (
            <View style={styles.statusRow}>
              <View style={[styles.dot, styles.dotOk]} />
              <Text style={[styles.statusText, styles.statusOk]}>
                {health.message}
              </Text>
            </View>
          )}

          {health.status === 'error' && (
            <View style={styles.statusRow}>
              <View style={[styles.dot, styles.dotError]} />
              <Text style={[styles.statusText, styles.statusError]}>
                {health.message}
              </Text>
            </View>
          )}

          {health.status === 'idle' && (
            <Text style={styles.healthHint}>
              กดปุ่มด้านล่างเพื่อตรวจสอบ
            </Text>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.button,
              pressed && styles.buttonPressed,
              health.status === 'loading' && styles.buttonDisabled,
            ]}
            onPress={checkHealth}
            disabled={health.status === 'loading'}
            accessibilityRole="button"
            accessibilityLabel="Check API Health"
          >
            <Text style={styles.buttonText}>
              {health.status === 'loading'
                ? 'กำลังตรวจสอบ...'
                : 'ตรวจสอบ API / Check API Health'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scroll: {
    padding: 20,
    gap: 16,
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
  },
  subheading: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: -8,
    marginBottom: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    width: '47%',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTh: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  cardEn: {
    fontSize: 12,
    color: '#6b7280',
  },
  comingSoonBadge: {
    marginTop: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  comingSoonText: {
    fontSize: 11,
    color: '#1a56db',
    fontWeight: '500',
  },
  healthCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  healthTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
  },
  healthDesc: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: -4,
  },
  healthHint: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 4,
  },
  indicator: {
    paddingVertical: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotOk: {
    backgroundColor: '#16a34a',
  },
  dotError: {
    backgroundColor: '#dc2626',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  statusOk: {
    color: '#16a34a',
  },
  statusError: {
    color: '#dc2626',
  },
  button: {
    backgroundColor: '#1a56db',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
