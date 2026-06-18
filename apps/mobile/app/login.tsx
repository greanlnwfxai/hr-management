import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/auth/useAuth';

const DEMO_LOGIN = 'admin';
const DEMO_PASSWORD = 'admin1234';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, isLoading, isAuthenticated, error } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/home');
    }
  }, [isAuthenticated]);

  const handleLogin = async () => {
    if (!email.trim() || !password) return;
    await signIn(email.trim(), password);
  };

  const fillDemo = () => {
    setEmail(DEMO_LOGIN);
    setPassword(DEMO_PASSWORD);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.logoBox}>
            <Text style={styles.appTitle}>HR Management</Text>
            <Text style={styles.appSubtitle}>ระบบบริหารทรัพยากรบุคคล</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>เข้าสู่ระบบ</Text>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.field}>
              <Text style={styles.label}>ชื่อผู้ใช้หรืออีเมล</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="admin หรือ admin@hr.local"
                placeholderTextColor="#9ca3af"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="default"
                returnKeyType="next"
                editable={!isLoading}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>รหัสผ่าน</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                placeholderTextColor="#9ca3af"
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                editable={!isLoading}
              />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
                (isLoading || !email.trim() || !password) &&
                  styles.buttonDisabled,
              ]}
              onPress={handleLogin}
              disabled={isLoading || !email.trim() || !password}
              accessibilityRole="button"
              accessibilityLabel="เข้าสู่ระบบ"
            >
              {isLoading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.buttonText}>เข้าสู่ระบบ</Text>
              )}
            </Pressable>
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.demoButton,
              pressed && styles.demoButtonPressed,
            ]}
            onPress={fillDemo}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="ใช้บัญชีทดสอบ"
          >
            <Text style={styles.demoButtonText}>ใช้บัญชีทดสอบ (Demo)</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 20,
  },
  logoBox: {
    alignItems: 'center',
    marginBottom: 4,
  },
  appTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1a56db',
    letterSpacing: 0.4,
  },
  appSubtitle: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 4,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#dc2626',
  },
  errorText: {
    fontSize: 13,
    color: '#dc2626',
    lineHeight: 18,
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  button: {
    backgroundColor: '#1a56db',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  demoButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  demoButtonPressed: {
    opacity: 0.6,
  },
  demoButtonText: {
    fontSize: 13,
    color: '#1a56db',
    fontWeight: '500',
  },
});
