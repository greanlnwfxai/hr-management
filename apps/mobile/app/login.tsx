import { useRouter } from 'expo-router';
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function LoginScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.logoBox}>
          <Text style={styles.appTitle}>HR Management</Text>
          <Text style={styles.appSubtitle}>Mobile App</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.noticeTh}>
            การเข้าสู่ระบบจะพร้อมใช้งานใน T-043
          </Text>
          <Text style={styles.noticeEn}>
            Login will be implemented in T-043
          </Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          onPress={() => router.replace('/home')}
          accessibilityRole="button"
          accessibilityLabel="Continue to Home"
        >
          <Text style={styles.buttonText}>
            ดำเนินการต่อ / Continue to Home
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 20,
  },
  logoBox: {
    alignItems: 'center',
    marginBottom: 8,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1a56db',
    letterSpacing: 0.4,
  },
  appSubtitle: {
    fontSize: 17,
    fontWeight: '500',
    color: '#374151',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  noticeTh: {
    fontSize: 15,
    color: '#374151',
    textAlign: 'center',
    lineHeight: 22,
  },
  noticeEn: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#1a56db',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
