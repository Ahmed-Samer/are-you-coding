import { createFileRoute } from "@tanstack/react-router";
import { useQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { listErrorReports } from "@/lib/admin.functions";
import { timeAgo } from "@/lib/admin-utils";

const PAGE_SIZE = 25;

const initialQuery = queryOptions({
  queryKey: ["admin", "errors", { page: 1, scope: "all" as const }],
  queryFn: () => listErrorReports({ data: { page: 1, pageSize: PAGE_SIZE } }),
});

export const Route = createFileRoute("/_authenticated/admin/errors")({
  head: () => ({ meta: [{ title: "Admin — Errors" }] }),
  loader: ({ context }) => context.queryClient.ensureQueryData(initialQuery),
  component: ErrorsPage,
});

type ErrorRow = {
  id: string;
  message: string;
  scope: string | null;
  created_at: string;
  url: string | null;
};

function ErrorsPage() {
  const fetcher = useServerFn(listErrorReports);
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState<"all" | "client" | "server">("all");
  const [search, setSearch] = useState("");

  const { data, isFetching } = useQuery({
    queryKey: ["admin", "errors", { page, scope }],
    queryFn: () =>
      fetcher({
        data: {
          page,
          pageSize: PAGE_SIZE,
          ...(scope === "all" ? {} : { scope }),
        },
      }),
    placeholderData: (prev) => prev,
  });

  const rows = (data?.entries ?? []) as ErrorRow[];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.message.toLowerCase().includes(q) ||
        (r.url ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <AdminShell
      title="Errors"
      description="Recent exceptions across the platform — investigate before they reach users."
      breadcrumbs={[{ label: "Errors" }]}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search message or URL"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={scope}
          onValueChange={(v) => { setScope(v as typeof scope); setPage(1); }}
        >
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scopes</SelectItem>
            <SelectItem value="client">Client</SelectItem>
            <SelectItem value="server">Server</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {isFetching && rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {search ? "No errors match your search." : "No errors reported."}
          </div>
        ) : (
          filtered.map((e) => (
            <div key={e.id} className="p-5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{e.message}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {e.url ? <span className="font-mono mr-2 truncate inline-block max-w-md align-middle">{e.url}</span> : null}
                  Last seen {timeAgo(e.created_at)}
                </div>
              </div>
              <Badge variant="destructive" className="capitalize flex-shrink-0">{e.scope ?? "error"}</Badge>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Page {page} of {totalPages} · {total} total
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1 || isFetching}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages || isFetching}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </AdminShell>
  );
}
