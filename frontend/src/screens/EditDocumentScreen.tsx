import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ApiError } from "@/api/client";
import { getDocument, patchDocument } from "@/api/documents";
import { PrimaryButton } from "@/components/PrimaryButton";
import { colors } from "@/theme/tokens";
import type { RootStackParamList } from "@/types/navigation";
import type { DocumentListItem, ExtractedLink } from "@/api/types";
import { cleanSummary, cleanTitle } from "@/utils/text";

type Props = NativeStackScreenProps<RootStackParamList, "EditDocument">;
type SanitizedLink = { url: string; content: string };
type PatchPayload = {
  title?: string;
  description?: string;
  links?: SanitizedLink[];
};

export function EditDocumentScreen({ route, navigation }: Props) {
  const { documentId } = route.params;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => getDocument(documentId),
  });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [summary, setSummary] = useState("");
  const [links, setLinks] = useState<ExtractedLink[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [newContent, setNewContent] = useState("");

  useEffect(() => {
    if (!query.data) return;
    setTitle(cleanTitle(query.data.document.title));
    setDescription(query.data.document.description);
    setSummary(cleanSummary(query.data.document.summary));
    setLinks(query.data.document.links.filter((link) => !isOriginalSourceLink(link)));
  }, [query.data]);

  const initialState = useMemo(() => {
    if (!query.data) return null;
    return {
      title: cleanTitle(query.data.document.title).trim(),
      description: query.data.document.description.trim(),
      links: query.data.document.links
        .filter((link) => !isOriginalSourceLink(link))
        .map((link) => ({ url: link.url.trim(), content: link.content.trim() }))
        .filter((link) => link.content.length > 0 && isHttpUrl(link.url)),
    };
  }, [query.data]);

  const sanitizedLinks = useMemo<SanitizedLink[]>(
    () =>
      links
        .map((link) => ({ url: link.url.trim(), content: link.content.trim() }))
        .filter((link) => link.content.length > 0 && isHttpUrl(link.url)),
    [links],
  );

  const patchPayload = useMemo<PatchPayload>(() => {
    if (!initialState) return {};

    const nextTitle = title.trim();
    const nextDescription = description.trim();
    const payload: PatchPayload = {};

    if (nextTitle !== initialState.title) {
      payload.title = nextTitle;
    }
    if (nextDescription !== initialState.description) {
      payload.description = nextDescription;
    }
    if (JSON.stringify(sanitizedLinks) !== JSON.stringify(initialState.links)) {
      payload.links = sanitizedLinks;
    }

    return payload;
  }, [description, initialState, sanitizedLinks, title]);

  const saveMutation = useMutation({
    mutationFn: () =>
      patchDocument(documentId, patchPayload),
    onSuccess: async ({ document }) => {
      queryClient.setQueryData(["document", documentId], { document });
      queryClient.setQueriesData({ queryKey: ["documents"] }, (oldData: unknown) => {
        if (!oldData || typeof oldData !== "object") return oldData;
        const typed = oldData as {
          pages?: Array<{ items: DocumentListItem[] }>;
          pageParams?: unknown[];
        };
        if (!typed.pages) return oldData;

        return {
          ...typed,
          pages: typed.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              item.id === documentId
                ? {
                    ...item,
                    title: document.title,
                    description: document.description,
                    summary: document.summary,
                  }
                : item,
            ),
          })),
        };
      });

      await queryClient.invalidateQueries({ queryKey: ["document", documentId] });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      Alert.alert("저장 완료", "문서를 수정했습니다.");
      navigation.replace("Tabs", {
        screen: "Documents",
        params: { refreshToken: Date.now(), refreshDelayMs: 3000 },
      });
    },
    onError: (error) => {
      const message =
        error instanceof ApiError
          ? `${error.message} (${error.code}/${error.status})`
          : "수정 저장에 실패했습니다.";
      Alert.alert("저장 실패", message);
    },
  });

  const canAddLink = useMemo(() => {
    if (!newUrl || !newContent) return false;
    return isHttpUrl(newUrl);
  }, [newContent, newUrl]);

  const hasChanges = useMemo(() => {
    return Object.keys(patchPayload).length > 0;
  }, [patchPayload]);

  const canSave = title.trim().length > 0 && hasChanges;

  const addLink = () => {
    if (!canAddLink) return;
    setLinks((prev) => [...prev, { url: newUrl.trim(), content: newContent.trim() }]);
    setNewUrl("");
    setNewContent("");
  };

  if (query.isLoading || !query.data) {
    return (
      <View style={styles.center}>
        <Text style={styles.loading}>불러오는 중...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Edit</Text>
        <View style={styles.headerRow}>
          <Text style={styles.title}>문서 수정</Text>
          <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>취소</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>제목</Text>
        <TextInput value={title} onChangeText={setTitle} style={styles.input} placeholder="문서 제목" />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.label}>요약</Text>
          <Text style={styles.sectionMeta}>읽기 전용</Text>
        </View>
        <TextInput
          value={summary}
          editable={false}
          style={[styles.input, styles.multiInput, styles.readOnlyInput]}
          multiline
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>메모</Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          style={[styles.input, styles.multiInput]}
          multiline
          placeholder="문서 메모"
        />
      </View>

      <PrimaryButton label="저장" onPress={() => saveMutation.mutate()} disabled={!canSave} loading={saveMutation.isPending} />

      <View style={styles.section}>
        <View style={styles.linkHeader}>
          <View style={styles.sectionHeader}>
            <Text style={styles.label}>링크</Text>
            <Text style={styles.sectionMeta}>{links.length}</Text>
          </View>
          <Pressable style={styles.addButton} onPress={addLink} disabled={!canAddLink}>
            <Text style={[styles.addText, !canAddLink && styles.addTextDisabled]}>+ 추가</Text>
          </Pressable>
        </View>
        <View style={styles.linkComposer}>
          <TextInput value={newUrl} onChangeText={setNewUrl} style={styles.input} placeholder="https://example.com" />
          <TextInput value={newContent} onChangeText={setNewContent} style={styles.input} placeholder="링크 설명" />
        </View>
        <View style={styles.linkList}>
          {links.map((link, index) => (
            <View key={`${link.url}-${index}`} style={styles.linkItem}>
              <View style={styles.linkTextWrap}>
                <Text style={styles.linkUrl} numberOfLines={1}>
                  {link.url}
                </Text>
                <Text style={styles.linkContent}>{link.content}</Text>
              </View>
              <Pressable
                style={styles.removeButton}
                onPress={() => setLinks((prev) => prev.filter((_, idx) => idx !== index))}
              >
                <Text style={styles.removeText}>삭제</Text>
              </Pressable>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
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
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
  },
  title: {
    flex: 1,
    fontFamily: "System",
    fontWeight: "700",
    fontSize: 30,
    letterSpacing: -0.6,
    color: colors.textPrimary,
  },
  headerButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  headerButtonText: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 14,
    color: colors.textPrimary,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flex: 1,
  },
  label: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 15,
    color: colors.textPrimary,
  },
  sectionMeta: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 12,
    color: colors.textSecondary,
  },
  input: {
    minHeight: 48,
    borderRadius: 18,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontFamily: "System",
    fontSize: 15,
    color: colors.textPrimary,
  },
  multiInput: {
    minHeight: 120,
    textAlignVertical: "top",
  },
  readOnlyInput: {
    color: colors.textSecondary,
    backgroundColor: "#F9FAFC",
  },
  linkHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
  },
  addButton: {
    minHeight: 30,
    justifyContent: "center",
  },
  addText: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 14,
    color: colors.primary,
  },
  addTextDisabled: {
    color: colors.textSecondary,
  },
  linkComposer: {
    gap: 10,
  },
  linkList: {
    gap: 12,
  },
  linkItem: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  linkTextWrap: {
    flex: 1,
    gap: 4,
  },
  linkUrl: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 14,
    color: colors.primary,
  },
  linkContent: {
    fontFamily: "System",
    fontSize: 13,
    color: colors.textSecondary,
  },
  removeButton: {
    minHeight: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    backgroundColor: "#F1F3F7",
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 12,
    color: colors.textSecondary,
  },
});

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isOriginalSourceLink(link: ExtractedLink) {
  return (link.content ?? "").trim().toLowerCase() === "original source";
}
