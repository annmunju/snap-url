import { ScrollView, Pressable, StyleSheet, Text } from "react-native";
import { colors, radius } from "@/theme/tokens";
import type { CategorySelection } from "@/utils/category";
import type { CategoryItem } from "@/api/types";

type Props = {
  options: CategoryItem[];
  value: CategorySelection;
  onChange: (value: CategorySelection) => void;
};

export function CategoryChips({ options, value, onChange }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.container}>
      {options.map((item) => {
        const active = item.key === value;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            style={[styles.chip, active ? styles.activeChip : styles.inactiveChip]}
          >
            <Text style={[styles.label, active ? styles.activeText : styles.inactiveText]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
    paddingVertical: 2,
  },
  chip: {
    minHeight: 30,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 5,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  activeChip: {
    backgroundColor: "#E7F2FF",
    borderColor: "#D4E7FF",
  },
  inactiveChip: {
    backgroundColor: colors.card,
    borderColor: colors.border,
  },
  label: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 13,
  },
  activeText: {
    color: colors.primary,
  },
  inactiveText: {
    color: colors.textSecondary,
  },
});
