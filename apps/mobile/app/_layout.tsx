import { AuthProvider } from '../src/auth/AuthProvider';
import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Head>
          <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        </Head>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="home" options={{ headerShown: false }} />
          <Stack.Screen name="calendar" options={{ headerShown: false }} />
          <Stack.Screen name="attendance" options={{ headerShown: false }} />
          <Stack.Screen name="leave" options={{ headerShown: false }} />
          <Stack.Screen name="profile" options={{ headerShown: false }} />
          <Stack.Screen name="approvals" options={{ headerShown: false }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
