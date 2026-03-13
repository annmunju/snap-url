import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, typography } from "@/theme/tokens";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export function PrimaryButton({ label, onPress, disabled, loading }: Props) {
  const isDisabled = Boolean(disabled || loading);
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [styles.button, isDisabled && styles.buttonDisabled, pressed && styles.buttonPressed]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.text}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: {
    opacity: 0.9,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  text: {
    ...typography.button,
    color: "#fff",
  },
});
