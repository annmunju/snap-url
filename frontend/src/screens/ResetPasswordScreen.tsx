import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@/auth/context";
import { PrimaryButton } from "@/components/PrimaryButton";
import { colors, radius, spacing } from "@/theme/tokens";

export function ResetPasswordScreen() {
  const { passwordRecovery, completePasswordReset, cancelPasswordRecovery } = useAuth();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    if (password.length < 8) {
      Alert.alert("비밀번호 확인", "비밀번호는 8자 이상 입력해 주세요.");
      return;
    }
    if (password !== passwordConfirm) {
      Alert.alert("비밀번호 확인", "비밀번호가 일치하지 않습니다.");
      return;
    }

    setLoading(true);
    try {
      await completePasswordReset(password);
    } catch (error) {
      Alert.alert("비밀번호 변경 실패", error instanceof Error ? error.message : "다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>ArchiveURL</Text>
        <Text style={styles.title}>새 비밀번호 설정</Text>
        <Text style={styles.body}>
          {passwordRecovery?.email
            ? `${passwordRecovery.email} 계정의 새 비밀번호를 입력하세요.`
            : "비밀번호를 새로 설정한 뒤 바로 로그인됩니다."}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>새 비밀번호</Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          placeholder="8자 이상 비밀번호"
          placeholderTextColor={colors.textSecondary}
        />
        <Text style={styles.label}>비밀번호 확인</Text>
        <TextInput
          value={passwordConfirm}
          onChangeText={setPasswordConfirm}
          secureTextEntry
          textContentType="newPassword"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          placeholder="비밀번호 다시 입력"
          placeholderTextColor={colors.textSecondary}
        />
        <PrimaryButton label="비밀번호 변경" onPress={onSubmit} disabled={loading} loading={loading} />
        <Pressable onPress={() => void cancelPasswordRecovery()} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>취소하고 로그인으로 돌아가기</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingTop: 36,
    gap: 28,
  },
  hero: {
    gap: 10,
  },
  eyebrow: {
    fontFamily: "System",
    fontWeight: "700",
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.primary,
  },
  title: {
    fontFamily: "System",
    fontWeight: "800",
    fontSize: 28,
    lineHeight: 34,
    color: colors.textPrimary,
  },
  body: {
    fontFamily: "System",
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.xl,
    padding: spacing.large,
    gap: 14,
  },
  label: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 13,
    color: colors.textSecondary,
  },
  input: {
    minHeight: 52,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#fff",
    paddingHorizontal: 14,
    fontFamily: "System",
    fontSize: 16,
    color: colors.textPrimary,
  },
  cancelButton: {
    alignItems: "center",
    paddingTop: 6,
  },
  cancelButtonText: {
    fontFamily: "System",
    fontWeight: "700",
    fontSize: 14,
    color: colors.textSecondary,
  },
});
