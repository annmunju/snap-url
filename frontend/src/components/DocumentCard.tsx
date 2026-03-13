import { Pressable, StyleSheet, Text, View } from "react-native";
import { Pin } from "lucide-react-native";
import type { DocumentListItem } from "@/api/types";
import { colors } from "@/theme/tokens";
import { fromNow } from "@/utils/time";
import { cleanTitle, getListDescription } from "@/utils/text";

type Props = {
  item: DocumentListItem;
  onPress: () => void;
};

export function DocumentCard({ item, onPress }: Props) {
  const domain = safeDomain(item.url);
  const title = cleanTitle(item.title);
  const description = getListDescription(item);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, item.is_pinned && styles.pinnedCard, pressed && styles.pressed]}
    >
      {item.is_pinned ? (
        <View style={styles.pinBadgeFloat}>
          <Pin size={16} color="#0553B1" strokeWidth={2.2} />
        </View>
      ) : null}
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
      </View>
      <Text style={styles.description} numberOfLines={3}>
        {description}
      </Text>
      <View style={styles.metaRow}>
        <Text style={styles.metaText}>{domain}</Text>
        <Text style={styles.metaText}>•</Text>
        <Text style={styles.metaText}>{fromNow(item.created_at)}</Text>
      </View>
    </Pressable>
  );
}

function safeDomain(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

const styles = StyleSheet.create({
  card: {
    position: "relative",
    backgroundColor: colors.card,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pinnedCard: {
    borderColor: "#BFD9FB",
    backgroundColor: "#F7FBFF",
  },
  pressed: {
    opacity: 0.92,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pinBadgeFloat: {
    position: "absolute",
    left: -6,
    top: -6,
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  title: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 17,
    lineHeight: 23,
    color: colors.textPrimary,
    flex: 1,
  },
  description: {
    fontFamily: "System",
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  metaRow: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  metaText: {
    fontFamily: "System",
    fontSize: 13,
    color: colors.textSecondary,
  },
});
