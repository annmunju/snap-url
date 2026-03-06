export const colors = {
  background: "#FFFFFF",
  primary: "#007AFF",
  success: "#34C759",
  error: "#FF3B30",
  textPrimary: "#000000",
  textSecondary: "#71717A",
  card: "#F5F5F5",
  input: "#FFFFFF",
  border: "#E5E5EA",
} as const;

export const spacing = {
  small: 8,
  medium: 16,
  large: 24,
  xlarge: 32,
} as const;

export const radius = {
  sm: 12,
  md: 16,
  lg: 26,
  xl: 36,
} as const;

export const typography = {
  appTitle: {
    fontFamily: "Inter_700ExtraBold",
    fontSize: 30,
  },
  screenTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
  },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 20,
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  button: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
  },
} as const;
