import { Pressable, StyleSheet, Text, View } from 'react-native';

interface FeatureCardProps {
  title: string;
  description?: string;
  icon: string;
  enabled: boolean;
  badge?: string;
  onPress?: () => void;
}

export function FeatureCard({ title, description, icon, enabled, badge, onPress }: FeatureCardProps) {
  const badgeText = badge ?? (enabled ? 'เปิดใช้งาน' : 'เร็ว ๆ นี้');
  const badgeStyle = enabled ? styles.activeBadge : styles.comingSoonBadge;
  const badgeTextStyle = enabled ? styles.activeBadgeText : styles.comingSoonBadgeText;

  if (enabled && onPress) {
    return (
      <Pressable
        style={({ pressed }) => [styles.card, styles.cardEnabled, pressed && styles.pressed]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={title}
      >
        <Text style={styles.icon}>{icon}</Text>
        <Text style={styles.title}>{title}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
        <View style={badgeStyle}>
          <Text style={badgeTextStyle}>{badgeText}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={[styles.card, styles.cardDisabled]}>
      <Text style={[styles.icon, styles.iconDisabled]}>{icon}</Text>
      <Text style={[styles.title, styles.titleDisabled]}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      <View style={badgeStyle}>
        <Text style={badgeTextStyle}>{badgeText}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    padding: 16,
    width: '47%',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardEnabled: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#1a56db',
  },
  cardDisabled: {
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  icon: {
    fontSize: 22,
    marginBottom: 4,
  },
  iconDisabled: {
    opacity: 0.5,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  titleDisabled: {
    color: '#9ca3af',
  },
  description: {
    fontSize: 11,
    color: '#6b7280',
    lineHeight: 15,
  },
  activeBadge: {
    marginTop: 6,
    backgroundColor: '#dcfce7',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  activeBadgeText: {
    fontSize: 11,
    color: '#16a34a',
    fontWeight: '600',
  },
  comingSoonBadge: {
    marginTop: 6,
    backgroundColor: '#f3f4f6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  comingSoonBadgeText: {
    fontSize: 11,
    color: '#6b7280',
    fontWeight: '500',
  },
  pressed: { opacity: 0.78 },
});
