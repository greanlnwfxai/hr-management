import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';

export function MobileScreenHeader({
  title,
  subtitle,
  action,
  backHref,
  dark = false,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  backHref?: string;
  dark?: boolean;
}) {
  const router = useRouter();

  return (
    <View style={[styles.header, dark && styles.headerDark]}>
      <View style={styles.row}>
        {backHref ? (
          <Pressable
            style={({ pressed }) => [styles.backBtn, dark && styles.backBtnDark, pressed && styles.pressed]}
            onPress={() => router.replace(backHref)}
            accessibilityRole="button"
            accessibilityLabel="กลับ"
          >
            <Text style={[styles.backBtnText, dark && styles.backBtnTextDark]}>‹</Text>
          </Pressable>
        ) : null}
        <View style={styles.titleBlock}>
          <Text style={[styles.title, dark && styles.titleDark]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, dark && styles.subtitleDark]}>{subtitle}</Text> : null}
        </View>
        {action ? <View style={styles.action}>{action}</View> : <View style={styles.actionSpacer} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
    backgroundColor: '#f8f9fa',
  },
  headerDark: {
    backgroundColor: '#1e3a8a',
    shadowColor: '#0d1e4a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  backBtnDark: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 0,
  },
  backBtnText: {
    fontSize: 22,
    lineHeight: 22,
    color: '#111827',
  },
  backBtnTextDark: {
    color: '#ffffff',
  },
  titleBlock: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
  },
  titleDark: {
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 13,
    color: '#6b7280',
  },
  subtitleDark: {
    color: 'rgba(255,255,255,0.7)',
  },
  action: {
    alignItems: 'flex-end',
  },
  actionSpacer: {
    width: 38,
  },
  pressed: {
    opacity: 0.8,
  },
});
