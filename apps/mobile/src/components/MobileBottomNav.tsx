import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const NAV_ITEMS = [
  { href: '/home', label: 'Home', icon: '⌂' },
  { href: '/calendar', label: 'Calendar', icon: '◫' },
  { href: '/attendance', label: 'Attendance', icon: '◷' },
  { href: '/leave', label: 'Leave', icon: '▣' },
  { href: '/profile', label: 'Profile', icon: '○' },
] as const;

export function MobileBottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.container}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Pressable
              key={item.href}
              style={({ pressed }) => [
                styles.item,
                isActive && styles.itemActive,
                pressed && styles.itemPressed,
              ]}
              onPress={() => {
                if (!isActive) router.replace(item.href);
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
            >
              <Text style={[styles.icon, isActive && styles.iconActive]}>{item.icon}</Text>
              <Text style={[styles.label, isActive && styles.labelActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  item: {
    flex: 1,
    minHeight: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  itemActive: {
    backgroundColor: '#eff6ff',
  },
  itemPressed: {
    opacity: 0.8,
  },
  icon: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '700',
  },
  iconActive: {
    color: '#1a56db',
  },
  label: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '600',
  },
  labelActive: {
    color: '#1a56db',
  },
});
