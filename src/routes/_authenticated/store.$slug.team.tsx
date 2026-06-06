import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { Mail, Trash2, UserPlus, Users, Clock } from "lucide-react";
import { useStore } from "@/lib/store-context";
import { useUser } from "@/lib/auth-context";
import {
  listTenantMembers,
  inviteTenantMember,
  updateTenantMemberRole,
  removeTenantMember,
  resendTenantInvite,
  revokeTenantInvite,
} from "@/lib/rbac.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import { cn } from "@/lib/utils";

type Role = "owner" | "manager" | "staff" | "viewer";
type InviteRole = Exclude<Role, "owner">;

type Member = {
  id: string;
  userId: string;
  role: Role;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
  createdAt: string;
  isRootOwner: boolean;
};

type PendingInvite = {
  id: string;
  email: string;
  role: Role;
  status: string;
  expiresAt: string;
  createdAt: string;
};

type MembersResponse = {
  members: Member[];
  pendingInvites: PendingInvite[];
  callerRole: Role | null;
  canManage: boolean;
};

const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
  viewer: "Viewer",
};

function RoleBadge({ role }: { role: Role }) {
  const variant: Record<Role, "default" | "secondary" | "outline"> = {
    owner: "default",
    manager: "secondary",
    staff: "outline",
    viewer: "outline",
  };
  return <Badge variant={variant[role]}>{ROLE_LABEL[role]}</Badge>;
}

function initialsFor(m: Member) {
  const src = (m.fullName || m.email || "?").trim();
  const parts = src.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[1][0] : src.slice(0, 2);
  return letters.toUpperCase();
}

function relativeExpiry(iso: string): { text: string; urgent: boolean; expired: boolean } {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return { text: "Expired", urgent: true, expired: true };
  const mins = Math.round(diffMs / 60_000);
  const hours = Math.round(mins / 60);
  const days = Math.round(hours / 24);
  if (mins < 60) return { text: `expires in ${mins}m`, urgent: true, expired: false };
  if (hours < 24) return { text: `expires in ${hours}h`, urgent: hours < 24, expired: false };
  return { text: `expires in ${days}d`, urgent: false, expired: false };
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  role: z.enum(["manager", "staff", "viewer"]),
});

export const Route = createFileRoute("/_authenticated/store/$slug/team")({
  head: () => ({ meta: [{ title: "Team — Store admin" }] }),
  component: TeamPage,
});

function TeamPage() {
  const { tenant } = useStore();
  const user = useUser();
  const qc = useQueryClient();

  const list = useServerFn(listTenantMembers);
  const invite = useServerFn(inviteTenantMember);
  const update = useServerFn(updateTenantMemberRole);
  const remove = useServerFn(removeTenantMember);
  const resend = useServerFn(resendTenantInvite);
  const revoke = useServerFn(revokeTenantInvite);

  const queryKey = ["tenant-members", tenant.id] as const;

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: () => list({ data: { tenantId: tenant.id } }) as Promise<MembersResponse>,
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<PendingInvite | null>(null);

  const canManage = !!data?.canManage;
  const callerRole = data?.callerRole ?? null;
  const isCallerOwner = callerRole === "owner";

  // ----- mutations -----
  const inviteMut = useMutation({
    mutationFn: (v: { email: string; role: InviteRole }) =>
      invite({ data: { tenantId: tenant.id, ...v } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Invite sent");
      setInviteOpen(false);
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "Failed to invite");
      if (msg.startsWith("ALREADY_MEMBER")) {
        toast.error("This user is already on your team.");
      } else {
        toast.error(msg);
      }
    },
  });

  const roleMut = useMutation({
    mutationFn: (v: { memberId: string; role: Role }) =>
      update({ data: { tenantId: tenant.id, ...v } }),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<MembersResponse>(queryKey);
      if (prev) {
        qc.setQueryData<MembersResponse>(queryKey, {
          ...prev,
          members: prev.members.map((m) =>
            m.id === v.memberId ? { ...m, role: v.role } : m,
          ),
        });
      }
      return { prev };
    },
    onError: (e: any, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error(e?.message ?? "Failed to update role");
    },
    onSuccess: () => toast.success("Role updated"),
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const removeMut = useMutation({
    mutationFn: (memberId: string) =>
      remove({ data: { tenantId: tenant.id, memberId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Member removed");
      setConfirmRemove(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to remove"),
  });

  const resendMut = useMutation({
    mutationFn: (inviteId: string) =>
      resend({ data: { tenantId: tenant.id, inviteId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Invite resent");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to resend invite"),
  });

  const revokeMut = useMutation({
    mutationFn: (inviteId: string) =>
      revoke({ data: { tenantId: tenant.id, inviteId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Invite revoked");
      setConfirmRevoke(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to revoke invite"),
  });

  const resendingId = resendMut.isPending ? (resendMut.variables as string | undefined) : null;
  const revokingId = revokeMut.isPending ? (revokeMut.variables as string | undefined) : null;

  // ----- render -----
  if (error) {
    const msg = String((error as any)?.message ?? "");
    const forbidden = msg.includes("FORBIDDEN");
    return (
      <div className="rounded-lg border border-border bg-card p-10 text-center">
        <h3 className="font-medium">
          {forbidden ? "You don't have access to this store's team." : "Couldn't load the team."}
        </h3>
        {!forbidden && <p className="mt-1 text-sm text-muted-foreground">{msg}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Team</h2>
          <p className="text-sm text-muted-foreground">
            Manage who can access <span className="font-medium">{tenant.name}</span>.
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={() => setInviteOpen(true)}>
            <UserPlus className="size-4 mr-1.5" />
            Invite member
          </Button>
        )}
      </div>

      {/* Members */}
      <section className="rounded-lg border border-border bg-card">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <h3 className="font-medium">Active members</h3>
          {data && (
            <span className="text-xs text-muted-foreground ml-auto">
              {data.members.length} {data.members.length === 1 ? "member" : "members"}
            </span>
          )}
        </div>

        {isLoading || !data ? (
          <div className="p-4">
            <TableSkeleton rows={3} cols={4} />
          </div>
        ) : data.members.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No members yet.</div>
        ) : (
          <MembersList
            members={data.members}
            canManage={canManage}
            isCallerOwner={isCallerOwner}
            currentUserId={user?.id ?? null}
            onChangeRole={(memberId, role) => roleMut.mutate({ memberId, role })}
            onRemove={(m) => setConfirmRemove(m)}
            pendingMemberId={roleMut.isPending ? (roleMut.variables as any)?.memberId : null}
          />
        )}
      </section>

      {/* Pending invites */}
      {data && (canManage || data.pendingInvites.length > 0) && (
        <section className="rounded-lg border border-border bg-card">
          <div className="px-5 py-4 border-b border-border flex items-center gap-2">
            <Mail className="size-4 text-muted-foreground" />
            <h3 className="font-medium">Pending invites</h3>
            <span className="text-xs text-muted-foreground ml-auto">
              {data.pendingInvites.length} pending
            </span>
          </div>
          {data.pendingInvites.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No outstanding invites.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {data.pendingInvites.map((inv) => {
                const exp = relativeExpiry(inv.expiresAt);
                return (
                  <li
                    key={inv.id}
                    className="flex flex-col sm:flex-row sm:items-center gap-3 p-4"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{inv.email}</div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="size-3" />
                        <span className={cn(exp.urgent && "text-destructive font-medium")}>
                          {exp.text}
                        </span>
                      </div>
                    </div>
                    <RoleBadge role={inv.role} />
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => resendMut.mutate(inv.id)}
                          disabled={resendingId === inv.id || revokingId === inv.id}
                        >
                          {resendingId === inv.id ? "Sending…" : "Resend"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmRevoke(inv)}
                          disabled={resendingId === inv.id || revokingId === inv.id}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          {revokingId === inv.id ? "Revoking…" : "Revoke"}
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Dialogs */}
      <InviteMemberDialog
        open={inviteOpen}
        onOpenChange={(v) => {
          setInviteOpen(v);
          if (!v) inviteMut.reset();
        }}
        onSubmit={(v) => inviteMut.mutate(v)}
        pending={inviteMut.isPending}
      />

      <ConfirmDialog
        open={!!confirmRemove}
        onOpenChange={(v) => { if (!v) setConfirmRemove(null); }}
        title={confirmRemove ? `Remove ${confirmRemove.fullName || confirmRemove.email || "member"}?` : ""}
        description="They'll immediately lose access to this store. You can re-invite them later."
        confirmLabel="Remove"
        destructive
        loading={removeMut.isPending}
        onConfirm={() => { if (confirmRemove) removeMut.mutate(confirmRemove.id); }}
      />

      <ConfirmDialog
        open={!!confirmRevoke}
        onOpenChange={(v) => { if (!v) setConfirmRevoke(null); }}
        title={confirmRevoke ? `Revoke invite to ${confirmRevoke.email}?` : ""}
        description="The recipient won't be able to use the link they were sent. You can invite them again later."
        confirmLabel="Revoke"
        destructive
        loading={revokeMut.isPending}
        onConfirm={() => { if (confirmRevoke) revokeMut.mutate(confirmRevoke.id); }}
      />
    </div>
  );
}

// ============================================================================
// MembersList — table on >= sm, card stack on mobile
// ============================================================================
function MembersList({
  members,
  canManage,
  isCallerOwner,
  currentUserId,
  onChangeRole,
  onRemove,
  pendingMemberId,
}: {
  members: Member[];
  canManage: boolean;
  isCallerOwner: boolean;
  currentUserId: string | null;
  onChangeRole: (memberId: string, role: Role) => void;
  onRemove: (m: Member) => void;
  pendingMemberId: string | null;
}) {
  const roleOptions = useMemo<Role[]>(() => {
    // Only owners may grant the 'owner' role; the server re-checks the root-owner rule.
    return isCallerOwner ? ["owner", "manager", "staff", "viewer"] : ["manager", "staff", "viewer"];
  }, [isCallerOwner]);

  return (
    <ul className="divide-y divide-border">
      {members.map((m) => {
        const isSelf = currentUserId === m.userId;
        const lockRole = !canManage || m.isRootOwner || isSelf;
        const lockRemove = !canManage || m.isRootOwner || isSelf;
        const updating = pendingMemberId === m.id;
        return (
          <li
            key={m.id}
            className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <Avatar className="size-10 shrink-0">
                {m.avatarUrl && <AvatarImage src={m.avatarUrl} alt="" />}
                <AvatarFallback>{initialsFor(m)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="font-medium text-sm truncate flex items-center gap-2">
                  {m.fullName || m.email || "Unknown user"}
                  {isSelf && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      You
                    </span>
                  )}
                  {m.isRootOwner && (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Creator
                    </span>
                  )}
                </div>
                {m.email && m.fullName && (
                  <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 sm:ml-auto">
              {lockRole ? (
                <RoleBadge role={m.role} />
              ) : (
                <Select
                  value={m.role}
                  onValueChange={(v) => onChangeRole(m.id, v as Role)}
                  disabled={updating}
                >
                  <SelectTrigger className="h-9 w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* Always allow keeping the current value, even if it's 'owner' for non-owner callers (read-only display). */}
                    {(roleOptions.includes(m.role) ? roleOptions : [m.role, ...roleOptions]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {!lockRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Remove member"
                  onClick={() => onRemove(m)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ============================================================================
// InviteMemberDialog
// ============================================================================
function InviteMemberDialog({
  open, onOpenChange, onSubmit, pending,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (v: { email: string; role: InviteRole }) => void;
  pending: boolean;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InviteRole>("staff");
  const [err, setErr] = useState<string | null>(null);

  // Reset on close
  function handleOpenChange(v: boolean) {
    if (!v) {
      setEmail("");
      setRole("staff");
      setErr(null);
    }
    onOpenChange(v);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = inviteSchema.safeParse({ email, role });
    if (!parsed.success) {
      setErr(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setErr(null);
    onSubmit(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a team member</DialogTitle>
          <DialogDescription>
            They'll receive an email with a link to join this store.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="inv-email">Email</Label>
            <Input
              id="inv-email"
              type="email"
              autoFocus
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
            />
          </div>
          <div>
            <Label htmlFor="inv-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as InviteRole)}>
              <SelectTrigger id="inv-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">Manager — can manage catalog, orders, and team</SelectItem>
                <SelectItem value="staff">Staff — can manage catalog and orders</SelectItem>
                <SelectItem value="viewer">Viewer — read-only access</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
