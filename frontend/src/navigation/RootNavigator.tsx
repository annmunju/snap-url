import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, Text, StyleSheet } from "react-native";
import type { RootStackParamList, TabParamList } from "@/types/navigation";
import { colors, radius } from "@/theme/tokens";
import { HomeScreen } from "@/screens/HomeScreen";
import { DocumentsScreen } from "@/screens/DocumentsScreen";
import { DocumentDetailScreen } from "@/screens/DocumentDetailScreen";
import { EditDocumentScreen } from "@/screens/EditDocumentScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabItem,
        tabBarIconStyle: styles.tabIconWrap,
        tabBarIcon: ({ focused }) => (
          <View style={[styles.tabPill, focused ? styles.tabPillActive : styles.tabPillInactive]}>
            <Text style={[styles.tabIcon, focused ? styles.tabLabelActive : styles.tabLabelInactive]}>
              {route.name === "Home" ? "⌂" : "▤"}
            </Text>
            <Text style={[styles.tabLabel, focused ? styles.tabLabelActive : styles.tabLabelInactive]}>
              {route.name === "Home" ? "홈" : "문서"}
            </Text>
          </View>
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Documents" component={DocumentsScreen} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer
      theme={{
        ...DefaultTheme,
        colors: {
          ...DefaultTheme.colors,
          background: colors.background,
        },
      }}
    >
      <Stack.Navigator>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="DocumentDetail" component={DocumentDetailScreen} options={{ title: "" }} />
        <Stack.Screen name="EditDocument" component={EditDocumentScreen} options={{ title: "" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: "rgba(255,255,255,0.94)",
    height: 58,
    marginHorizontal: 21,
    marginBottom: 21,
    borderRadius: radius.xl,
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 4,
    borderTopWidth: 0,
    elevation: 0,
    position: "absolute",
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabItem: {
    margin: 0,
    paddingTop: 0,
    paddingBottom: 0,
    height: 50,
  },
  tabIconWrap: {
    height: "100%",
    width: "100%",
    marginTop: 0,
    marginBottom: 0,
  },
  tabPill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: radius.lg,
    width: "100%",
    height: "100%",
  },
  tabPillActive: {
    backgroundColor: colors.primary,
  },
  tabPillInactive: {
    backgroundColor: "transparent",
  },
  tabIcon: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 16,
    lineHeight: 18,
  },
  tabLabel: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 14,
    letterSpacing: 0.3,
  },
  tabLabelActive: {
    color: "#fff",
  },
  tabLabelInactive: {
    color: colors.textSecondary,
  },
});
