import { useLayoutEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@/api/client";
import { deleteDocument, getDocument } from "@/api/documents";
import { colors } from "@/theme/tokens";
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
    staleTime: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteDocument(documentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.removeQueries({ queryKey: ["document", documentId] });
      Alert.alert("삭제 완료", "문서를 삭제했습니다.");
      navigation.replace("Tabs", {
        screen: "Documents",
        params: { refreshToken: Date.now(), refreshDelayMs: 3000 },
      });
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
    });
  }, [navigation]);

  const visibleLinks = useMemo(
    () =>
      (documentQuery.data?.document.links ?? []).filter(
        (link) => (link.content ?? "").trim().toLowerCase() !== "original source",
      ),
    [documentQuery.data?.document.links],
  );

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
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Document</Text>
        <Text style={styles.title}>{title}</Text>
      </View>

      <View style={styles.actionRow}>
        <Pressable
          style={[styles.actionButton, deleteMutation.isPending && styles.actionButtonDisabled]}
          onPress={() => navigation.navigate("EditDocument", { documentId })}
          disabled={deleteMutation.isPending}
        >
          <Text style={styles.actionButtonText}>수정</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => shareUrl(doc.url)}>
          <Text style={styles.actionButtonText}>공유</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, styles.actionButtonDestructive]}
          onPress={onDelete}
          disabled={deleteMutation.isPending}
        >
          <Text style={[styles.actionButtonText, styles.actionButtonDestructiveText]}>삭제</Text>
        </Pressable>
      </View>

      <View style={styles.sourceCard}>
        <Text style={styles.sourceLabel}>원본 URL</Text>
        <Pressable onPress={() => openUrl(doc.url)}>
          <Text style={styles.url}>{doc.url}</Text>
        </Pressable>
        <Text style={styles.meta}>{fromNow(doc.created_at)}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>요약</Text>
        <Text style={styles.body}>{doc.summary || "요약이 없습니다."}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>메모</Text>
        <Text style={styles.body}>{doc.description || "메모가 없습니다."}</Text>
      </View>

      <View style={styles.section}>
        <View style={styles.linksHeader}>
          <Text style={styles.sectionTitle}>링크</Text>
          <Text style={styles.linksCount}>{visibleLinks.length}</Text>
        </View>
        <View style={styles.links}>
          {visibleLinks.length === 0 ? <Text style={styles.emptyText}>추가된 링크가 없습니다.</Text> : null}
          {visibleLinks.map((link, index) => (
            <Pressable key={`${link.url}-${index}`} style={styles.linkCard} onPress={() => openUrl(link.url)}>
              <Text style={styles.linkUrl} numberOfLines={1}>
                {link.content || link.url}
              </Text>
              <Text style={styles.linkDesc} numberOfLines={2}>
                {link.url}
              </Text>
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
  });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 24,
    gap: 24,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loading: {
    fontFamily: "System",
    fontSize: 15,
    color: colors.textSecondary,
  },
  hero: {
    gap: 8,
  },
  eyebrow: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 12,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.textSecondary,
  },
  title: {
    fontFamily: "System",
    fontWeight: "700",
    fontSize: 28,
    lineHeight: 35,
    letterSpacing: -0.6,
    color: colors.textPrimary,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonDestructive: {
    backgroundColor: "#FFF3F2",
    borderColor: "#FFD8D5",
  },
  actionButtonText: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 14,
    color: colors.textPrimary,
  },
  actionButtonDestructiveText: {
    color: colors.error,
  },
  sourceCard: {
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  sourceLabel: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 12,
    letterSpacing: 0.5,
    color: colors.textSecondary,
  },
  url: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 15,
    lineHeight: 22,
    color: colors.primary,
  },
  meta: {
    fontFamily: "System",
    fontSize: 13,
    color: colors.textSecondary,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 18,
    color: colors.textPrimary,
  },
  body: {
    fontFamily: "System",
    fontSize: 15,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  linksHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  linksCount: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 13,
    color: colors.textSecondary,
  },
  links: {
    gap: 10,
  },
  linkCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 4,
  },
  linkUrl: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 14,
    color: colors.textPrimary,
  },
  linkDesc: {
    fontFamily: "System",
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  emptyText: {
    fontFamily: "System",
    fontSize: 14,
    color: colors.textSecondary,
  },
});
