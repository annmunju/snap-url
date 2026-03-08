import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InfiniteData, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { deleteDocument, listCategories, listDocuments, patchDocument } from "@/api/documents";
import { CategoryChips } from "@/components/CategoryChips";
import { SwipeableDocumentCard } from "@/components/SwipeableDocumentCard";
import { colors, typography } from "@/theme/tokens";
import type { RootStackParamList, TabParamList } from "@/types/navigation";
import type { CategoryItem, DocumentListItem } from "@/api/types";
import { ALL_CATEGORY_KEY, applyCategoryFilter, FALLBACK_CATEGORY_KEY, type CategorySelection } from "@/utils/category";

const PAGE_SIZE = 20;
type DocsNavigation = NativeStackNavigationProp<RootStackParamList>;
type DocumentsPage = Awaited<ReturnType<typeof listDocuments>>;

function removeDocumentFromPages(data: InfiniteData<DocumentsPage> | undefined, targetId: number) {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.filter((item) => item.id !== targetId),
    })),
  };
}

function togglePinnedInPages(data: InfiniteData<DocumentsPage> | undefined, targetId: number) {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.id === targetId
          ? {
              ...item,
              is_pinned: !item.is_pinned,
            }
          : item,
      ),
    })),
  };
}

function sortPinnedFirst(items: DocumentListItem[]): DocumentListItem[] {
  return [...items].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return b.id - a.id;
  });
}

export function DocumentsScreen() {
  const navigation = useNavigation<DocsNavigation>();
  const route = useRoute<RouteProp<TabParamList, "Documents">>();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<CategorySelection>(ALL_CATEGORY_KEY);
  const handledRefreshToken = useRef<number | null>(null);
  const openedSwipeableRef = useRef<(() => void) | null>(null);

  const query = useInfiniteQuery({
    queryKey: ["documents"],
    queryFn: ({ pageParam }) => listDocuments(PAGE_SIZE, pageParam as number),
    initialPageParam: 0,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.items.length < PAGE_SIZE) return undefined;
      return allPages.length * PAGE_SIZE;
    },
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategories(),
    staleTime: Infinity,
  });

  useEffect(() => {
    const refreshToken = route.params?.refreshToken;
    if (!refreshToken || handledRefreshToken.current === refreshToken) return;
    handledRefreshToken.current = refreshToken;
    const delay = route.params?.refreshDelayMs ?? 1000;
    const timer = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    }, delay);
    return () => clearTimeout(timer);
  }, [queryClient, route.params?.refreshDelayMs, route.params?.refreshToken]);

  const deleteMutation = useMutation({
    mutationFn: (documentId: number) => deleteDocument(documentId),
    onMutate: async (documentId) => {
      await queryClient.cancelQueries({ queryKey: ["documents"] });
      const previous = queryClient.getQueryData<InfiniteData<DocumentsPage>>(["documents"]);
      queryClient.setQueryData<InfiniteData<DocumentsPage>>(["documents"], (current) =>
        removeDocumentFromPages(current, documentId),
      );
      return { previous };
    },
    onError: (error, _documentId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["documents"], context.previous);
      }
      Alert.alert("삭제 실패", error instanceof Error ? error.message : "문서 삭제에 실패했습니다.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
  });

  const pinMutation = useMutation({
    mutationFn: async ({ documentId, nextPinned }: { documentId: number; nextPinned: boolean }) =>
      patchDocument(documentId, { is_pinned: nextPinned }),
    onMutate: async ({ documentId }) => {
      await queryClient.cancelQueries({ queryKey: ["documents"] });
      const previous = queryClient.getQueryData<InfiniteData<DocumentsPage>>(["documents"]);
      queryClient.setQueryData<InfiniteData<DocumentsPage>>(["documents"], (current) =>
        togglePinnedInPages(current, documentId),
      );
      return { previous };
    },
    onError: (error, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["documents"], context.previous);
      }
      Alert.alert("고정 변경 실패", error instanceof Error ? error.message : "고정 상태 변경에 실패했습니다.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
    },
  });

  const allItems = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data?.pages],
  );
  const categoryOptions = useMemo<CategoryItem[]>(
    () => [
      { key: ALL_CATEGORY_KEY, label: "전체", order: -1 },
      ...(categoriesQuery.data?.items ?? [{ key: FALLBACK_CATEGORY_KEY, label: "기타", order: 9999 }]),
    ],
    [categoriesQuery.data?.items],
  );

  useEffect(() => {
    if (categoryOptions.some((item) => item.key === category)) {
      return;
    }
    setCategory(ALL_CATEGORY_KEY);
  }, [category, categoryOptions]);

  const filtered = useMemo(
    () => sortPinnedFirst(applyCategoryFilter(allItems, category)),
    [allItems, category],
  );

  const handleSwipeableOpen = (close: () => void) => {
    if (openedSwipeableRef.current && openedSwipeableRef.current !== close) {
      openedSwipeableRef.current();
    }
    openedSwipeableRef.current = close;
  };

  const handleDelete = (item: DocumentListItem) => {
    if (deleteMutation.isPending || pinMutation.isPending) return;
    deleteMutation.mutate(item.id);
  };

  const handleTogglePin = (item: DocumentListItem) => {
    if (deleteMutation.isPending || pinMutation.isPending) return;
    pinMutation.mutate({ documentId: item.id, nextPinned: !item.is_pinned });
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Library</Text>
        <View style={styles.headerRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>내 문서</Text>
          </View>
        </View>
      </View>

      <View style={styles.categorySection}>
        <View style={styles.categoryHeader}>
          <Text style={styles.categoryLabel}>카테고리</Text>
          <Text style={styles.categoryMeta}>{filtered.length}</Text>
        </View>
        <CategoryChips options={categoryOptions} value={category} onChange={setCategory} />
      </View>

      <FlatList
        style={styles.list}
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={[styles.listContainer, { paddingBottom: tabBarHeight + insets.bottom + 20 }]}
        renderItem={({ item }) => (
          <SwipeableDocumentCard
            item={item}
            onSwipeableOpen={handleSwipeableOpen}
            onDelete={() => handleDelete(item)}
            onTogglePin={() => handleTogglePin(item)}
            disabled={deleteMutation.isPending || pinMutation.isPending}
            onPress={() => navigation.navigate("DocumentDetail", { documentId: item.id })}
          />
        )}
        onEndReached={() => query.fetchNextPage()}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => query.refetch()}
          />
        }
        ListEmptyComponent={<Text style={styles.empty}>문서가 없습니다.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingTop: 14,
    gap: 18,
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
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
  },
  titleBlock: {
    flex: 1,
    gap: 0,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
    letterSpacing: -0.6,
  },
  categorySection: {
    gap: 10,
    paddingBottom: 2,
  },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  categoryLabel: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 15,
    color: colors.textPrimary,
  },
  categoryMeta: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 13,
    color: colors.textSecondary,
  },
  list: {
    flex: 1,
  },
  listContainer: {
    paddingTop: 2,
    gap: 12,
  },
  empty: {
    paddingTop: 36,
    textAlign: "center",
    color: colors.textSecondary,
    fontFamily: "System",
    fontSize: 15,
  },
});
