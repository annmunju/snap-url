import { useCallback, useLayoutEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ApiError } from "@/api/client";
import { deleteDocument, getDocument } from "@/api/documents";
import { colors, radius, spacing, typography } from "@/theme/tokens";
import type { RootStackParamList } from "@/types/navigation";
import { fromNow } from "@/utils/time";
import { cleanTitle } from "@/utils/text";

type Props = NativeStackScreenProps<RootStackParamList, "DocumentDetail">;

export function DocumentDetailScreen({ route, navigation }: Props) {
  const { documentId } = route.params;
  const queryClient = useQueryClient();
  const documentQuery = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => getDocument(documentId),
  });

  useFocusEffect(
    useCallback(() => {
      documentQuery.refetch();
    }, [documentQuery]),
  );

  const deleteMutation = useMutation({
    mutationFn: () => deleteDocument(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      Alert.alert("삭제 완료", "문서를 삭제했습니다.");
      navigation.replace("Tabs", { screen: "Documents" });
    },
    onError: (error) => {
      const message =
        error instanceof ApiError
          ? `${error.message} (${error.code}/${error.status})`
          : "삭제에 실패했습니다.";
      Alert.alert("삭제 실패", message);
    },
  });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerBackTitleVisible: false,
      headerRight: () => (
        <Pressable style={styles.circleButton} onPress={() => shareUrl(documentQuery.data?.document.url)}>
          <Text style={styles.shareText}>↗</Text>
        </Pressable>
      ),
    });
  }, [documentQuery.data?.document.url, navigation]);

  if (documentQuery.isLoading || !documentQuery.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>불러오는 중...</Text>
      </View>
    );
  }

  const doc = documentQuery.data.document;
  const title = cleanTitle(doc.title);

  const onDelete = () => {
    Alert.alert("문서 삭제", "정말 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.actionRow}>
        <Pressable
          style={[styles.actionButton, deleteMutation.isPending && styles.actionButtonDisabled]}
          onPress={() => navigation.navigate("EditDocument", { documentId })}
          disabled={deleteMutation.isPending}
        >
          <Text style={styles.actionText}>수정</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, deleteMutation.isPending && styles.actionButtonDisabled]}
          onPress={onDelete}
          disabled={deleteMutation.isPending}
        >
          <Text style={styles.actionText}>삭제</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.url} onPress={() => openUrl(doc.url)}>
          {doc.url}
        </Text>
        <Text style={styles.meta}>{fromNow(doc.created_at)}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>요약</Text>
        <Text style={styles.body}>{doc.summary || "요약이 없습니다."}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>관련 링크</Text>
        <View style={styles.links}>
          {doc.links.map((link, index) => (
            <Pressable key={`${link.url}-${index}`} style={styles.linkCard} onPress={() => openUrl(link.url)}>
              <Text style={styles.linkUrl}>{link.url}</Text>
              <Text style={styles.linkDesc}>{link.content}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

async function openUrl(url?: string) {
  if (!url) return;
  const canOpen = await Linking.canOpenURL(url);
  if (canOpen) {
    await Linking.openURL(url);
  }
}

async function shareUrl(url?: string) {
  if (!url) return;
  await Share.share({
    message: url,
    url,
  });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 24,
    gap: spacing.large,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loading: {
    ...typography.body,
    color: colors.textSecondary,
  },
  circleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  shareText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: "row",
    gap: spacing.medium,
  },
  actionButton: {
    flex: 1,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: colors.textPrimary,
  },
  section: {
    gap: 12,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
  },
  url: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: colors.primary,
  },
  linkUrl: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: colors.primary,
  },
  meta: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.textSecondary,
  },
  sectionTitle: {
    ...typography.sectionLabel,
    color: colors.textPrimary,
  },
  body: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    lineHeight: 23,
    color: colors.textPrimary,
  },
  links: {
    gap: spacing.medium,
  },
  linkCard: {
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 4,
  },
  linkDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
});
