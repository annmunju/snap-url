export const colors = {
  background: "#F6F7FB",
  primary: "#0A84FF",
  success: "#30D158",
  error: "#FF453A",
  textPrimary: "#111114",
  textSecondary: "#6B6F7B",
  card: "#FFFFFF",
  input: "#FFFFFF",
  border: "#D9DCE5",
} as const;

export const spacing = {
  small: 8,
  medium: 16,
  large: 24,
  xlarge: 32,
} as const;

export const radius = {
  sm: 14,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const typography = {
  appTitle: {
    fontFamily: "System",
    fontSize: 34,
    fontWeight: "700",
  },
  screenTitle: {
    fontFamily: "System",
    fontSize: 28,
    fontWeight: "700",
  },
  sectionLabel: {
    fontFamily: "System",
    fontSize: 20,
    fontWeight: "600",
  },
  body: {
    fontFamily: "System",
    fontSize: 17,
    fontWeight: "400",
  },
  button: {
    fontFamily: "System",
    fontSize: 17,
    fontWeight: "600",
  },
} as const;
