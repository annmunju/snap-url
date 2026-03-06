import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createIngestJob, listIngestJobs } from "@/api/ingest";
import type { IngestJobListItem, IngestJobStatus } from "@/api/types";
import { PrimaryButton } from "@/components/PrimaryButton";
import { colors, radius, spacing, typography } from "@/theme/tokens";
import { fromNow } from "@/utils/time";

const INGEST_ACTIVE_LIST_LIMIT = 100;
const INGEST_LIST_POLL_MS = 5000;
const INGEST_JOBS_QUERY_KEY = ["ingestJobs"] as const;

const ACTIVE_STATUSES: IngestJobStatus[] = ["queued", "running"];
const ACTIVE_STATUS_PRIORITY: Record<IngestJobStatus, number> = {
  running: 0,
  queued: 1,
  failed: 2,
  succeeded: 3,
};

function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function HomeScreen() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const valid = isValidUrl(url);

  const mutation = useMutation({
    mutationFn: (rawUrl: string) => createIngestJob(rawUrl),
    onSuccess: () => {
      setUrl("");
      setError("");
      queryClient.invalidateQueries({ queryKey: INGEST_JOBS_QUERY_KEY });
    },
    onError: (err: Error) => {
      setError(err.message);
    },
  });

  const queuedJobsQuery = useQuery({
    queryKey: [...INGEST_JOBS_QUERY_KEY, "queued", INGEST_ACTIVE_LIST_LIMIT],
    queryFn: () => listIngestJobs(INGEST_ACTIVE_LIST_LIMIT, "queued"),
    staleTime: 0,
    refetchInterval: INGEST_LIST_POLL_MS,
    refetchOnWindowFocus: true,
  });

  const runningJobsQuery = useQuery({
    queryKey: [...INGEST_JOBS_QUERY_KEY, "running", INGEST_ACTIVE_LIST_LIMIT],
    queryFn: () => listIngestJobs(INGEST_ACTIVE_LIST_LIMIT, "running"),
    staleTime: 0,
    refetchInterval: INGEST_LIST_POLL_MS,
    refetchOnWindowFocus: true,
  });

  const activeJobs = useMemo(
    () => {
      const merged = [...(queuedJobsQuery.data?.items ?? []), ...(runningJobsQuery.data?.items ?? [])];
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
    [queuedJobsQuery.data?.items, runningJobsQuery.data?.items],
  );

  const onSubmit = () => {
    if (!valid) {
      setError("유효한 URL을 입력해 주세요.");
      return;
    }
    setError("");
    mutation.mutate(url);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <Text style={styles.title}>ARCHIVE-URL</Text>
      <View style={[styles.inputCard, !!error && styles.errorBorder]}>
        <TextInput
          placeholder="https://example.com"
          value={url}
          onChangeText={setUrl}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <PrimaryButton label="수집 시작" onPress={onSubmit} disabled={!valid} loading={mutation.isPending} />
      <View style={styles.jobsSection}>
        <Text style={styles.jobsTitle}>수집 요청 현황</Text>
        {queuedJobsQuery.isLoading || runningJobsQuery.isLoading ? (
          <Text style={styles.jobsMeta}>불러오는 중...</Text>
        ) : null}
        {queuedJobsQuery.isError || runningJobsQuery.isError ? (
          <Text style={styles.jobsError}>요청 현황을 불러오지 못했습니다.</Text>
        ) : null}
        {!queuedJobsQuery.isLoading &&
        !runningJobsQuery.isLoading &&
        !queuedJobsQuery.isError &&
        !runningJobsQuery.isError &&
        activeJobs.length === 0 ? (
          <Text style={styles.jobsMeta}>진행 중인 요청이 없습니다.</Text>
        ) : null}
        {activeJobs.map((item) => (
          <IngestJobRow key={item.id} item={item} />
        ))}
      </View>
    </SafeAreaView>
  );
}

function IngestJobRow({ item }: { item: IngestJobListItem }) {
  return (
    <View style={styles.jobRow}>
      <View style={styles.jobHeader}>
        <Text style={styles.jobId}>#{item.id}</Text>
        <StatusBadge status={item.status} />
      </View>
      <Text style={styles.jobUrl} numberOfLines={2} ellipsizeMode="tail">
        {item.normalized_url ?? "URL 정규화 대기 중"}
      </Text>
      <Text style={styles.jobUpdated}>최근 갱신 {fromNow(item.updated_at)}</Text>
      {item.status === "failed" && item.error_message ? (
        <Text style={styles.jobError} numberOfLines={2}>
          {item.error_message}
        </Text>
      ) : null}
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
    backgroundColor: colors.border,
  },
  running: {
    backgroundColor: colors.primary,
  },
  failed: {
    backgroundColor: colors.error,
  },
  succeeded: {
    backgroundColor: colors.success,
  },
};

const STATUS_TEXT_STYLE: Record<IngestJobStatus, object> = {
  queued: {
    color: colors.textPrimary,
  },
  running: {
    color: "#FFFFFF",
  },
  failed: {
    color: "#FFFFFF",
  },
  succeeded: {
    color: "#FFFFFF",
  },
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    paddingTop: 8,
    gap: spacing.medium,
  },
  title: {
    ...typography.appTitle,
    color: colors.textPrimary,
  },
  inputCard: {
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.input,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  input: {
    ...typography.body,
    color: colors.textPrimary,
  },
  errorBorder: {
    borderColor: colors.error,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    color: colors.error,
    fontSize: 13,
  },
  jobsSection: {
    gap: 10,
    marginTop: 4,
  },
  jobsTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: colors.textPrimary,
  },
  jobsMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.textSecondary,
  },
  jobsError: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.error,
  },
  jobRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: colors.input,
  },
  jobHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  jobId: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: colors.textSecondary,
  },
  jobUrl: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  jobUpdated: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: colors.textSecondary,
  },
  jobError: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: colors.error,
    lineHeight: 17,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
});
