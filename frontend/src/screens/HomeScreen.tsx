import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "@react-navigation/native";
import { Alert, AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { deleteCurrentUserAccount } from "@/api/account";
import { getDocument } from "@/api/documents";
import { createIngestJob, listIngestJobs } from "@/api/ingest";
import type { IngestJob, IngestJobListItem, IngestJobStatus } from "@/api/types";
import { useAuth } from "@/auth/context";
import { PrimaryButton } from "@/components/PrimaryButton";
import { consumePendingSharedUrl } from "@/native/sharedIngest";
import { colors, radius, spacing, typography } from "@/theme/tokens";
import { fromNow } from "@/utils/time";

const INGEST_ACTIVE_LIST_LIMIT = 100;
const INGEST_RECENT_LIST_LIMIT = 100;
const INGEST_LIST_POLL_MS = 5000;
const INGEST_JOBS_QUERY_KEY = ["ingestJobs"] as const;
const RECENT_FINISHED_WINDOW_MS = 30 * 60 * 1000;
const DOCUMENT_OUTCOME_THRESHOLD_MS = 5000;

const ACTIVE_STATUSES: IngestJobStatus[] = ["queued", "running"];
const ACTIVE_STATUS_PRIORITY: Record<IngestJobStatus, number> = {
  running: 0,
  queued: 1,
  failed: 2,
  succeeded: 3,
};

function toIngestJobListItem(job: IngestJob): IngestJobListItem {
  return {
    id: job.id,
    normalized_url: job.normalized_url ?? job.raw_url,
    status: job.status,
    document_id: job.document_id,
    error_code: job.error_code,
    error_message: job.error_message,
    updated_at: job.updated_at,
  };
}

function upsertJob(
  items: IngestJobListItem[] | undefined,
  nextItem: IngestJobListItem,
): IngestJobListItem[] {
  const deduped = (items ?? []).filter((item) => item.id !== nextItem.id);
  return [nextItem, ...deduped].sort((a, b) => b.id - a.id);
}

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function HomeScreen() {
  const { state, signOut } = useAuth();
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [recentJobs, setRecentJobs] = useState<IngestJobListItem[]>([]);
  const [jobOutcomeLabels, setJobOutcomeLabels] = useState<Record<number, "created" | "updated">>({});
  const [selectedPanel, setSelectedPanel] = useState<"active" | "recent">("active");
  const recentJobTimeoutsRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const syncedDocumentJobIdsRef = useRef<Set<number>>(new Set());
  const resolvedOutcomeJobIdsRef = useRef<Set<number>>(new Set());
  const submitUrlRef = useRef<(rawUrl: string, description?: string) => void>(
    (_rawUrl: string, _description?: string) => undefined,
  );
  const queuedRefetchRef = useRef<() => Promise<unknown>>(() => Promise.resolve());
  const runningRefetchRef = useRef<() => Promise<unknown>>(() => Promise.resolve());
  const latestRefetchRef = useRef<() => Promise<unknown>>(() => Promise.resolve());
  const queryClient = useQueryClient();
  const valid = isValidUrl(url);

  useEffect(() => {
    const timeoutHandles = recentJobTimeoutsRef.current;
    return () => {
      timeoutHandles.forEach((handle) => clearTimeout(handle));
      timeoutHandles.clear();
    };
  }, []);

  const mutation = useMutation({
    mutationFn: ({ rawUrl, description }: { rawUrl: string; description?: string }) =>
      createIngestJob(rawUrl, description),
    onSuccess: async (response) => {
      setUrl("");
      setNote("");
      setError("");
      const nextItem = toIngestJobListItem(response.job);
      setRecentJobs((current) => upsertJob(current, nextItem));
      const existingTimeout = recentJobTimeoutsRef.current.get(nextItem.id);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }
      recentJobTimeoutsRef.current.set(
        nextItem.id,
        setTimeout(() => {
          setRecentJobs((current) => current.filter((item) => item.id !== nextItem.id));
          recentJobTimeoutsRef.current.delete(nextItem.id);
        }, 15000),
      );

      if (nextItem.status === "queued" || nextItem.status === "running") {
        queryClient.setQueryData<{ items: IngestJobListItem[] }>(
          [...INGEST_JOBS_QUERY_KEY, nextItem.status, INGEST_ACTIVE_LIST_LIMIT],
          (current) => ({
            items: upsertJob(current?.items, nextItem),
          }),
        );
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: INGEST_JOBS_QUERY_KEY }),
        queryClient.refetchQueries({
          queryKey: [...INGEST_JOBS_QUERY_KEY, "queued", INGEST_ACTIVE_LIST_LIMIT],
          exact: true,
        }),
        queryClient.refetchQueries({
          queryKey: [...INGEST_JOBS_QUERY_KEY, "running", INGEST_ACTIVE_LIST_LIMIT],
          exact: true,
        }),
      ]);
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: deleteCurrentUserAccount,
    onSuccess: async () => {
      await signOut();
    },
    onError: (err: Error) => {
      Alert.alert("계정 삭제 실패", err.message);
    },
  });

  const submitUrl = useCallback(
    (rawUrl: string, description?: string) => {
      if (mutation.isPending) {
        return;
      }

      if (!isValidUrl(rawUrl)) {
        setError("유효한 URL을 입력해 주세요.");
        return;
      }

      setError("");
      setUrl(rawUrl);
      if (description !== undefined) {
        setNote(description);
      }
      mutation.mutate({ rawUrl, description });
    },
    [mutation],
  );

  const queuedJobsQuery = useQuery({
    queryKey: [...INGEST_JOBS_QUERY_KEY, "queued", INGEST_ACTIVE_LIST_LIMIT],
    queryFn: () => listIngestJobs(INGEST_ACTIVE_LIST_LIMIT, "queued"),
    staleTime: 0,
    refetchInterval: (query) => ((query.state.data?.items?.length ?? 0) > 0 ? INGEST_LIST_POLL_MS : false),
    refetchOnWindowFocus: false,
  });

  const runningJobsQuery = useQuery({
    queryKey: [...INGEST_JOBS_QUERY_KEY, "running", INGEST_ACTIVE_LIST_LIMIT],
    queryFn: () => listIngestJobs(INGEST_ACTIVE_LIST_LIMIT, "running"),
    staleTime: 0,
    refetchInterval: (query) => ((query.state.data?.items?.length ?? 0) > 0 ? INGEST_LIST_POLL_MS : false),
    refetchOnWindowFocus: false,
  });

  const latestJobsQuery = useQuery({
    queryKey: [...INGEST_JOBS_QUERY_KEY, "latest", INGEST_RECENT_LIST_LIMIT],
    queryFn: () => listIngestJobs(INGEST_RECENT_LIST_LIMIT),
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const activeJobs = useMemo(
    () => {
      const merged = [
        ...recentJobs,
        ...(queuedJobsQuery.data?.items ?? []),
        ...(runningJobsQuery.data?.items ?? []),
      ];
      const deduped = new Map<number, IngestJobListItem>();
      for (const item of merged) {
        if (ACTIVE_STATUSES.includes(item.status)) {
          deduped.set(item.id, item);
        }
      }
      return [...deduped.values()].sort((a, b) => {
        const byStatus = ACTIVE_STATUS_PRIORITY[a.status] - ACTIVE_STATUS_PRIORITY[b.status];
        if (byStatus !== 0) {
          return byStatus;
        }
        return b.id - a.id;
      });
    },
    [recentJobs, queuedJobsQuery.data?.items, runningJobsQuery.data?.items],
  );

  const recentFinishedJobs = useMemo(
    () =>
      (latestJobsQuery.data?.items ?? []).filter((item) => {
        const normalized = item.updated_at.includes("T") ? item.updated_at : item.updated_at.replace(" ", "T");
        const withTimezone = /[zZ]|[+-]\d{2}:\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
        const updatedAt = Date.parse(withTimezone);
        if (Number.isNaN(updatedAt)) {
          return false;
        }

        return Date.now() - updatedAt <= RECENT_FINISHED_WINDOW_MS;
      }),
    [latestJobsQuery.data?.items],
  );

  useEffect(() => {
    const completedJobs = [...activeJobs, ...recentFinishedJobs].filter(
      (item) => item.status === "succeeded" && item.document_id,
    );
    const unseenCompletedJobs = completedJobs.filter((item) => !syncedDocumentJobIdsRef.current.has(item.id));
    if (unseenCompletedJobs.length === 0) {
      return;
    }

    unseenCompletedJobs.forEach((item) => {
      syncedDocumentJobIdsRef.current.add(item.id);
    });

    void Promise.all([
      queryClient.invalidateQueries({ queryKey: ["documents"] }),
      queryClient.invalidateQueries({ queryKey: ["categories"] }),
    ]);
  }, [activeJobs, recentFinishedJobs, queryClient]);

  useEffect(() => {
    const completedJobs = [...activeJobs, ...recentFinishedJobs].filter(
      (item) => item.status === "succeeded" && item.document_id,
    );
    const unresolvedJobs = completedJobs.filter((item) => !resolvedOutcomeJobIdsRef.current.has(item.id));
    if (unresolvedJobs.length === 0) {
      return;
    }

    unresolvedJobs.forEach((item) => {
      resolvedOutcomeJobIdsRef.current.add(item.id);
    });

    void Promise.all(
      unresolvedJobs.map(async (item) => {
        try {
          const response = await getDocument(item.document_id as number);
          const createdAt = Date.parse(response.document.created_at);
          const updatedAt = Date.parse(item.updated_at);
          const wasUpdated =
            !Number.isNaN(createdAt) &&
            !Number.isNaN(updatedAt) &&
            updatedAt - createdAt > DOCUMENT_OUTCOME_THRESHOLD_MS;

          setJobOutcomeLabels((current) => ({
            ...current,
            [item.id]: wasUpdated ? "updated" : "created",
          }));
        } catch {
          resolvedOutcomeJobIdsRef.current.delete(item.id);
        }
      }),
    );
  }, [activeJobs, recentFinishedJobs]);

  const onSubmit = () => {
    submitUrl(url, note.trim() || undefined);
  };

  const onDeleteAccount = () => {
    Alert.alert("계정 삭제", "계정과 연결된 문서 접근이 차단됩니다. 계속할까요?", [
      {
        text: "취소",
        style: "cancel",
      },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => {
          deleteAccountMutation.mutate();
        },
      },
    ]);
  };

  const panelCount = selectedPanel === "active" ? activeJobs.length : recentFinishedJobs.length;
  const panelIsLoading =
    selectedPanel === "active" ? queuedJobsQuery.isLoading || runningJobsQuery.isLoading : latestJobsQuery.isLoading;
  const panelIsError =
    selectedPanel === "active" ? queuedJobsQuery.isError || runningJobsQuery.isError : latestJobsQuery.isError;
  const panelItems = selectedPanel === "active" ? activeJobs : recentFinishedJobs;
  const panelIsRefreshing =
    selectedPanel === "active"
      ? (queuedJobsQuery.isRefetching || runningJobsQuery.isRefetching) &&
        !(queuedJobsQuery.isLoading || runningJobsQuery.isLoading)
      : latestJobsQuery.isRefetching && !latestJobsQuery.isLoading;
  const panelEmptyText =
    selectedPanel === "active"
      ? "진행 중인 요청이 없습니다."
      : "최근 30분 내 요청이 없습니다.";

  const refreshPanel = useCallback(() => {
    if (selectedPanel === "active") {
      void Promise.all([queuedJobsQuery.refetch(), runningJobsQuery.refetch()]);
    } else {
      void latestJobsQuery.refetch();
    }
  }, [latestJobsQuery, queuedJobsQuery, runningJobsQuery, selectedPanel]);

  useEffect(() => {
    submitUrlRef.current = submitUrl;
    queuedRefetchRef.current = queuedJobsQuery.refetch;
    runningRefetchRef.current = runningJobsQuery.refetch;
    latestRefetchRef.current = latestJobsQuery.refetch;
  }, [latestJobsQuery.refetch, queuedJobsQuery.refetch, runningJobsQuery.refetch, submitUrl]);

  useEffect(() => {
    let syncing = false;

    const syncFromSharedEntry = async () => {
      if (syncing) {
        return;
      }

      syncing = true;
      try {
        await Promise.all([
          queuedRefetchRef.current(),
          runningRefetchRef.current(),
          latestRefetchRef.current(),
        ]);

        const sharedPayload = await consumePendingSharedUrl();
        if (sharedPayload?.url) {
          submitUrlRef.current(sharedPayload.url, sharedPayload.note);
        }
      } catch {
        setError("공유된 링크를 불러오지 못했습니다.");
      } finally {
        syncing = false;
      }
    };

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void syncFromSharedEntry();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const syncPendingSharedUrl = async () => {
        try {
          const sharedPayload = await consumePendingSharedUrl();
          if (!cancelled && sharedPayload?.url) {
            submitUrlRef.current(sharedPayload.url, sharedPayload.note);
          }
        } catch {
          if (!cancelled) {
            setError("공유된 링크를 불러오지 못했습니다.");
          }
        }
      };

      void Promise.all([
        queuedRefetchRef.current(),
        runningRefetchRef.current(),
        latestRefetchRef.current(),
      ]);
      void syncPendingSharedUrl();

      return () => {
        cancelled = true;
      };
    }, []),
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <View style={styles.headerContent}>
        <View style={styles.hero}>
          <View style={styles.heroTopRow}>
            <Text style={styles.eyebrow}>Capture once, review later</Text>
            <Pressable style={styles.signOutButton} onPress={() => void signOut()}>
              <Text style={styles.signOutButtonText}>로그아웃</Text>
            </Pressable>
          </View>
          <Text style={styles.title}>ARCHIVE-URL</Text>
          {state.status === "signedIn" ? <Text style={styles.accountMeta}>{state.user.email}</Text> : null}
          <Pressable style={styles.deleteAccountButton} onPress={onDeleteAccount} disabled={deleteAccountMutation.isPending}>
            <Text style={styles.deleteAccountButtonText}>
              {deleteAccountMutation.isPending ? "계정 삭제 중..." : "계정 삭제"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.composeSection}>
          <Text style={styles.composeLabel}>수집 요청</Text>
          <View style={[styles.inputCard, !!error && styles.errorBorder]}>
            <TextInput
              placeholder="https://example.com"
              placeholderTextColor={colors.textSecondary}
              value={url}
              onChangeText={setUrl}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
          </View>
          <Text style={styles.optionalFieldLabel}>메모 (선택)</Text>
          <View style={[styles.inputCard, styles.noteCard]}>
            <TextInput
              placeholder="메모를 추가하세요"
              placeholderTextColor={colors.textSecondary}
              value={note}
              onChangeText={setNote}
              multiline
              textAlignVertical="top"
              style={styles.noteInput}
            />
          </View>
          <View style={styles.composeButtonGap} />
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <PrimaryButton label="수집 시작" onPress={onSubmit} disabled={!valid} loading={mutation.isPending} />
        </View>
      </View>

      <View style={styles.listSections}>
        <View style={styles.panelTabs}>
          <Pressable
            style={[styles.panelTab, selectedPanel === "active" && styles.panelTabActive]}
            onPress={() => setSelectedPanel("active")}
          >
            <Text style={[styles.panelTabText, selectedPanel === "active" && styles.panelTabTextActive]}>
              진행 중인 요청 {activeJobs.length}
            </Text>
            <View style={[styles.panelTabIndicator, selectedPanel === "active" && styles.panelTabIndicatorActive]} />
          </Pressable>
          <Pressable
            style={[styles.panelTab, selectedPanel === "recent" && styles.panelTabActive]}
            onPress={() => setSelectedPanel("recent")}
          >
            <Text style={[styles.panelTabText, selectedPanel === "recent" && styles.panelTabTextActive]}>
              최근 요청 {recentFinishedJobs.length}
            </Text>
            <View style={[styles.panelTabIndicator, selectedPanel === "recent" && styles.panelTabIndicatorActive]} />
          </Pressable>
        </View>

        <View style={styles.jobsPanel}>
          <ScrollView
            style={styles.sectionScroll}
            contentContainerStyle={[
              styles.sectionScrollContent,
              panelItems.length === 0 && styles.sectionScrollContentEmpty,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={panelIsRefreshing} onRefresh={refreshPanel} />}
          >
            {panelIsLoading ? <Text style={styles.jobsMeta}>불러오는 중...</Text> : null}
            {panelIsError ? (
              <Text style={styles.jobsError}>
                {selectedPanel === "active" ? "요청 현황을 불러오지 못했습니다." : "최근 요청을 불러오지 못했습니다."}
              </Text>
            ) : null}
            {!panelIsLoading && !panelIsError && panelItems.length === 0 ? (
              <Text style={styles.jobsMeta}>{panelEmptyText}</Text>
            ) : null}
            {panelItems.length > 0 ? (
              <View style={styles.activityBlock}>
                {panelItems.map((item, index) => (
                  <IngestJobRow
                    key={item.id}
                    item={item}
                    isFirst={index === 0}
                    outcome={jobOutcomeLabels[item.id]}
                  />
                ))}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

function IngestJobRow({
  item,
  isFirst,
  outcome,
}: {
  item: IngestJobListItem;
  isFirst: boolean;
  outcome?: "created" | "updated";
}) {
  return (
    <View style={[styles.jobRow, !isFirst && styles.jobRowDivider]}>
      <View style={styles.jobRail}>
        <View style={[styles.jobDot, JOB_DOT_STYLE[item.status]]} />
      </View>
      <View style={styles.jobContent}>
        <View style={styles.jobHeader}>
          <Text style={styles.jobId}>#{item.id}</Text>
          <StatusBadge status={item.status} />
        </View>
        <Text style={styles.jobUrl} numberOfLines={2} ellipsizeMode="tail">
          {item.normalized_url ?? "URL 정규화 대기 중"}
        </Text>
        <Text style={styles.jobUpdated}>최근 갱신 {fromNow(item.updated_at)}</Text>
        {item.status === "succeeded" && outcome ? (
          <Text style={outcome === "updated" ? styles.jobOutcomeUpdated : styles.jobOutcomeCreated}>
            {outcome === "updated" ? "기존 문서를 업데이트했습니다." : "새 문서를 추가했습니다."}
          </Text>
        ) : null}
        {item.status === "failed" && item.error_message ? (
          <Text style={styles.jobError} numberOfLines={2}>
            {item.error_message}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function StatusBadge({ status }: { status: IngestJobStatus }) {
  return (
    <View style={[styles.badge, STATUS_STYLE[status]]}>
      <Text style={[styles.badgeText, STATUS_TEXT_STYLE[status]]}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

const STATUS_LABEL: Record<IngestJobStatus, string> = {
  queued: "대기",
  running: "처리 중",
  failed: "실패",
  succeeded: "완료",
};

const STATUS_STYLE: Record<IngestJobStatus, object> = {
  queued: {
    backgroundColor: "#EEF1F5",
  },
  running: {
    backgroundColor: "#E7F2FF",
  },
  failed: {
    backgroundColor: "#FFE9E7",
  },
  succeeded: {
    backgroundColor: "#E8F8EE",
  },
};

const STATUS_TEXT_STYLE: Record<IngestJobStatus, object> = {
  queued: {
    color: colors.textSecondary,
  },
  running: {
    color: colors.primary,
  },
  failed: {
    color: "#D63A31",
  },
  succeeded: {
    color: "#249B50",
  },
};

const JOB_DOT_STYLE: Record<IngestJobStatus, object> = {
  queued: {
    backgroundColor: "#B6BBC8",
  },
  running: {
    backgroundColor: colors.primary,
  },
  failed: {
    backgroundColor: "#D63A31",
  },
  succeeded: {
    backgroundColor: "#249B50",
  },
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 24,
  },
  listSections: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 14,
  },
  panelTabs: {
    flexDirection: "row",
    gap: 18,
  },
  panelTab: {
    paddingTop: 4,
    paddingBottom: 10,
    alignItems: "flex-start",
    justifyContent: "center",
    gap: 8,
  },
  panelTabActive: {},
  panelTabText: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 14,
    color: colors.textSecondary,
  },
  panelTabTextActive: {
    color: colors.textPrimary,
  },
  panelTabIndicator: {
    height: 2,
    width: "100%",
    backgroundColor: "transparent",
    borderRadius: 999,
  },
  panelTabIndicatorActive: {
    backgroundColor: colors.primary,
  },
  jobsPanel: {
    flex: 1,
    minHeight: 0,
    gap: 12,
  },
  sectionScroll: {
    flex: 1,
    minHeight: 0,
  },
  sectionScrollContent: {
    paddingBottom: 4,
    gap: 4,
  },
  sectionScrollContentEmpty: {
    flexGrow: 1,
  },
  hero: {
    gap: 8,
    paddingTop: 8,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
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
    ...typography.appTitle,
    color: colors.textPrimary,
    letterSpacing: -0.8,
  },
  accountMeta: {
    fontFamily: "System",
    fontSize: 13,
    color: colors.textSecondary,
  },
  deleteAccountButton: {
    alignSelf: "flex-start",
    paddingTop: 2,
  },
  deleteAccountButtonText: {
    fontFamily: "System",
    fontWeight: "700",
    fontSize: 12,
    color: colors.error,
  },
  signOutButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  signOutButtonText: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 12,
    color: colors.textPrimary,
  },
  composeSection: {
    gap: 12,
  },
  composeLabel: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 15,
    color: colors.textPrimary,
  },
  optionalFieldLabel: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 13,
    color: colors.textSecondary,
  },
  inputCard: {
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  noteCard: {
    height: 96,
    paddingTop: 14,
    paddingBottom: 14,
    justifyContent: "flex-start",
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
  },
  noteInput: {
    ...typography.body,
    color: colors.textPrimary,
    minHeight: 64,
    lineHeight: 21,
  },
  composeButtonGap: {
    height: 0,
  },
  errorBorder: {
    borderColor: colors.error,
  },
  errorText: {
    ...typography.body,
    color: colors.error,
    fontSize: 13,
  },
  jobsSection: {
    gap: 14,
    marginTop: 2,
  },
  jobsHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  jobsTitle: {
    ...typography.sectionLabel,
    fontSize: 17,
    color: colors.textPrimary,
  },
  jobsCount: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 14,
    color: colors.textSecondary,
  },
  jobsMeta: {
    ...typography.body,
    fontSize: 14,
    color: colors.textSecondary,
  },
  jobsError: {
    ...typography.body,
    fontSize: 14,
    color: colors.error,
  },
  activityBlock: {
    gap: 0,
  },
  jobRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 14,
  },
  jobRowDivider: {
    borderTopWidth: 1,
    borderTopColor: "#ECEEF3",
  },
  jobRail: {
    paddingTop: 6,
    width: 10,
    alignItems: "center",
  },
  jobDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  jobContent: {
    flex: 1,
    gap: 8,
  },
  jobHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  jobId: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 12,
    letterSpacing: 0.3,
    color: colors.textSecondary,
  },
  jobUrl: {
    ...typography.body,
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  jobUpdated: {
    ...typography.body,
    fontSize: 13,
    color: colors.textSecondary,
  },
  jobOutcomeCreated: {
    ...typography.body,
    fontSize: 13,
    color: "#249B50",
  },
  jobOutcomeUpdated: {
    ...typography.body,
    fontSize: 13,
    color: colors.primary,
  },
  jobError: {
    ...typography.body,
    fontSize: 13,
    color: colors.error,
    lineHeight: 19,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  badgeText: {
    fontFamily: "System",
    fontWeight: "600",
    fontSize: 11,
  },
});
