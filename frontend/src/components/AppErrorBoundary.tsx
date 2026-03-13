import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { captureFrontendError } from "@/monitoring";
import { colors, radius } from "@/theme/tokens";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

export class AppErrorBoundary extends Component<Props, State> {
  state: State = {
    hasError: false,
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    captureFrontendError(error, {
      source: "boundary",
      componentStack: errorInfo.componentStack,
    });
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>앱에 문제가 발생했습니다.</Text>
          <Text style={styles.body}>잠시 후 다시 시도해 주세요. 문제가 반복되면 앱을 다시 실행하세요.</Text>
          <Pressable onPress={this.handleRetry} style={styles.button}>
            <Text style={styles.buttonText}>다시 시도</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.textPrimary,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
  button: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
