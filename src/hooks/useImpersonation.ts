import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getImpersonationState } from "@/lib/impersonation.functions";

export type ImpersonationState = Awaited<ReturnType<typeof getImpersonationState>>;

export function useImpersonation() {
  const fetcher = useServerFn(getImpersonationState);
  const query = useQuery({
    queryKey: ["impersonation-state"],
    queryFn: () => fetcher(),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  return {
    state: query.data ?? null,
    isImpersonating: !!query.data,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}