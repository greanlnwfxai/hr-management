import { AuthProvider } from '../src/auth/AuthProvider';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1a56db' },
          headerTintColor: '#ffffff',
          headerTitleStyle: { fontWeight: '600' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen
          name="home"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="calendar"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="attendance"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="leave"
          options={{ title: 'การลา' }}
        />
      </Stack>
    </AuthProvider>
  );
}
