"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ActionResponse,
  AlertPreferences,
  Chain,
  ChannelsView,
  ExplainResponse,
  MeView,
  PortfolioView,
  SimulateScenario,
  SystemStatus,
  TelegramLinkCode,
  TokenLookupCandidate,
  WalletImportItem,
  WalletImportPreview,
} from "@nemea/shared-types";
import { api, ApiClientError } from "./api.ts";
import { writeSessionHint } from "./session-hint.ts";
import type { AlertResponse, AlertsResponse } from "./types.ts";

export const qk = {
  me: ["me"] as const,
  portfolio: ["portfolio"] as const,
  alerts: ["alerts"] as const,
  alert: (id: string) => ["alert", id] as const,
  explain: (id: string) => ["explain", id] as const,
  actions: (id: string, fraction: number, level: number) => ["actions", id, fraction, level] as const,
  channels: ["channels"] as const,
  pushKey: ["push-key"] as const,
  status: ["status"] as const,
};

export function useNow(intervalMs = 30_000): number {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return Date.now();
}

export function useMe(enabled = true) {
  return useQuery<MeView | null>({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        const me = await api<MeView>("/me");
        writeSessionHint(true);
        return me;
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 401) {
          writeSessionHint(false);
          return null;
        }
        throw error;
      }
    },
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function usePortfolio(enabled: boolean) {
  return useQuery<PortfolioView>({
    queryKey: qk.portfolio,
    queryFn: () => api<PortfolioView>("/portfolio"),
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled ? 30_000 : false,
    retry: false,
  });
}

export function useAlerts(enabled: boolean) {
  return useQuery<AlertsResponse>({
    queryKey: qk.alerts,
    queryFn: () => api<AlertsResponse>("/alerts?limit=30"),
    enabled,
    staleTime: 15_000,
    refetchInterval: enabled ? 30_000 : false,
    retry: false,
  });
}

export function useAlert(id: string, enabled: boolean) {
  return useQuery<AlertResponse>({
    queryKey: qk.alert(id),
    queryFn: () => api<AlertResponse>(`/alerts/${encodeURIComponent(id)}`),
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

export function useExplain(id: string, enabled: boolean) {
  return useQuery<ExplainResponse>({
    queryKey: qk.explain(id),
    queryFn: () => api<ExplainResponse>(`/alerts/${encodeURIComponent(id)}/explain`),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useActions(id: string, fraction: number, level: number, enabled: boolean) {
  return useQuery<ActionResponse>({
    queryKey: qk.actions(id, fraction, level),
    queryFn: () => api<ActionResponse>(`/alerts/${encodeURIComponent(id)}/actions?fraction=${fraction}`),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

export function useChannels(pollMs: number | false) {
  return useQuery<ChannelsView>({
    queryKey: qk.channels,
    queryFn: () => api<ChannelsView>("/channels"),
    refetchInterval: pollMs,
    staleTime: 5_000,
    retry: false,
  });
}

export function usePushKey(enabled: boolean) {
  return useQuery<{ publicKey: string | null }>({
    queryKey: qk.pushKey,
    queryFn: () => api<{ publicKey: string | null }>("/channels/push/public-key"),
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

export function useSystemStatus() {
  return useQuery<SystemStatus>({
    queryKey: qk.status,
    queryFn: () => api<SystemStatus>("/status"),
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: false,
  });
}

export function useStartGuest() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<MeView>("/auth/guest", { method: "POST" }),
    onSuccess: (me) => {
      writeSessionHint(true);
      client.setQueryData(qk.me, me);
      void client.invalidateQueries({ queryKey: qk.portfolio });
      void client.invalidateQueries({ queryKey: qk.alerts });
    },
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>("/auth/logout", { method: "POST" }),
    onSuccess: () => {
      writeSessionHint(false);
      client.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" && q.queryKey[0] !== "status" });
      client.setQueryData(qk.me, null);
    },
  });
}

export function useLookup() {
  return useMutation({
    mutationFn: (symbol: string) => api<{ candidates: TokenLookupCandidate[] }>(`/tokens/lookup?symbol=${encodeURIComponent(symbol)}`),
  });
}

type HoldingBody = { cmcId: number; amount: number; costBasisUsd: number | null };

export function useAddHolding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: HoldingBody) => api<{ portfolio: PortfolioView }>("/portfolio/holdings", { method: "POST", body }),
    onSuccess: ({ portfolio }) => client.setQueryData(qk.portfolio, portfolio),
  });
}

export function useUpdateHolding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; amount?: number; costBasisUsd?: number | null }) =>
      api<{ portfolio: PortfolioView }>(`/portfolio/holdings/${encodeURIComponent(id)}`, { method: "PATCH", body }),
    onSuccess: ({ portfolio }) => client.setQueryData(qk.portfolio, portfolio),
  });
}

export function useDeleteHolding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ portfolio: PortfolioView }>(`/portfolio/holdings/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: ({ portfolio }) => client.setQueryData(qk.portfolio, portfolio),
  });
}

export function useLoadSample() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ portfolio: PortfolioView }>("/portfolio/sample", { method: "POST" }),
    onSuccess: ({ portfolio }) => client.setQueryData(qk.portfolio, portfolio),
  });
}

export function useWalletPreview() {
  return useMutation({
    mutationFn: (body: { address: string; chains: Chain[] }) => api<WalletImportPreview>("/portfolio/import-wallet/preview", { method: "POST", body }),
  });
}

export function useWalletConfirm() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { address: string; chains: Chain[]; items: WalletImportItem[] }) => api<{ portfolio: PortfolioView }>("/portfolio/import-wallet/confirm", { method: "POST", body }),
    onSuccess: ({ portfolio }) => client.setQueryData(qk.portfolio, portfolio),
  });
}

export function useSimulate() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (scenario: SimulateScenario) => api<AlertResponse>("/alerts/simulate", { method: "POST", body: { scenario } }),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.alerts }),
  });
}

export function useMarkRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<{ ok: true }>(`/alerts/${encodeURIComponent(id)}/read`, { method: "POST" }),
    onSuccess: (_data, id) => {
      void client.invalidateQueries({ queryKey: qk.alerts });
      void client.invalidateQueries({ queryKey: qk.alert(id) });
    },
  });
}

export function useMarkAllRead() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>("/alerts/read-all", { method: "POST" }),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.alerts }),
  });
}

export function useSavePreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<AlertPreferences>) => api<{ preferences: AlertPreferences }>("/preferences", { method: "PUT", body: patch }),
    onSuccess: ({ preferences }) => {
      client.setQueryData<MeView | null>(qk.me, (me) => (me ? { ...me, preferences } : me));
      void client.invalidateQueries({ queryKey: ["actions"] });
    },
  });
}

export function useTelegramLink() {
  return useMutation({
    mutationFn: () => api<TelegramLinkCode>("/channels/telegram/link-code", { method: "POST" }),
  });
}

export function useUnlinkTelegram() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>("/channels/telegram", { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.channels }),
  });
}

export function useSetEmail() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => api<{ ok: true }>("/channels/email", { method: "POST", body: { email } }),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.channels }),
  });
}

export function useRemoveEmail() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: true }>("/channels/email", { method: "DELETE" }),
    onSuccess: () => client.invalidateQueries({ queryKey: qk.channels }),
  });
}

export function useVerifyEmail() {
  return useMutation({
    mutationFn: (token: string) => api<{ ok: true }>("/channels/email/verify", { method: "POST", body: { token } }),
  });
}
