import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  getFeatureFlags, 
  toggleFeatureFlag, 
  createFeatureFlag, 
  updateFeatureFlag, 
  deleteFeatureFlag 
} from "@/lib/flags.functions";

export type FeatureFlagRow = {
  key: string;
  description: string | null;
  enabled: boolean;
  rollout_percent: number;
  updated_at: string;
};

export function FlagsTable() {
  const queryClient = useQueryClient();
  
  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlagRow | null>(null);

  // Form states
  const [newKey, setNewKey] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editPercent, setEditPercent] = useState<number>(0);
  const [editDesc, setEditDesc] = useState("");

  const q = useQuery({
    queryKey: ["admin", "feature_flags"],
    queryFn: () => getFeatureFlags(),
  });

  const rows: FeatureFlagRow[] = (q.data as FeatureFlagRow[]) ?? [];

  const toggleMut = useMutation({
    mutationFn: (data: { key: string; enabled: boolean }) => toggleFeatureFlag({ data }),
    onSuccess: () => {
      toast.success("Feature flag updated.");
      queryClient.invalidateQueries({ queryKey: ["admin", "feature_flags"] });
    },
    onError: (err: Error) => toast.error(`Update failed: ${err.message}`),
  });

  const createMut = useMutation({
    mutationFn: () => createFeatureFlag({ data: { key: newKey, description: newDesc, enabled: false, rollout_percent: 0 } }),
    onSuccess: () => {
      toast.success("Feature flag created successfully.");
      queryClient.invalidateQueries({ queryKey: ["admin", "feature_flags"] });
      setIsCreateOpen(false);
      setNewKey("");
      setNewDesc("");
    },
    onError: (err: Error) => toast.error(`Creation failed: ${err.message}`),
  });

  const updateMut = useMutation({
    mutationFn: () => updateFeatureFlag({ data: { key: selectedFlag!.key, description: editDesc, rollout_percent: editPercent } }),
    onSuccess: () => {
      toast.success("Flag configuration saved.");
      queryClient.invalidateQueries({ queryKey: ["admin", "feature_flags"] });
      setIsEditOpen(false);
    },
    onError: (err: Error) => toast.error(`Save failed: ${err.message}`),
  });

  const deleteMut = useMutation({
    mutationFn: (key: string) => deleteFeatureFlag({ data: { key } }),
    onSuccess: () => {
      toast.success("Feature flag deleted permanently.");
      queryClient.invalidateQueries({ queryKey: ["admin", "feature_flags"] });
    },
    onError: (err: Error) => toast.error(`Delete failed: ${err.message}`),
  });

  const openEditModal = (flag: FeatureFlagRow) => {
    setSelectedFlag(flag);
    setEditDesc(flag.description || "");
    setEditPercent(flag.rollout_percent);
    setIsEditOpen(true);
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Feature Flags</h2>
          <p className="text-xs text-muted-foreground">
            Toggle platform features dynamically without deploying code.
          </p>
        </div>
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          Create Flag
        </Button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground bg-muted/40">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Flag Key</th>
              <th className="text-left px-4 py-2 font-medium">Description</th>
              <th className="text-center px-4 py-2 font-medium">Rollout %</th>
              <th className="text-center px-4 py-2 font-medium">Status</th>
              <th className="text-right px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {q.isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  Loading feature flags...
                </td>
              </tr>
            )}
            {!q.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No feature flags configured yet.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.key} className="hover:bg-muted/20">
                <td className="px-4 py-3 align-middle font-mono text-xs font-semibold">
                  {row.key}
                </td>
                <td className="px-4 py-3 align-middle max-w-[300px] truncate text-muted-foreground text-xs">
                  {row.description || "—"}
                </td>
                <td className="px-4 py-3 align-middle text-center">
                  <Badge variant={row.rollout_percent === 100 ? "default" : "secondary"}>
                    {row.rollout_percent}%
                  </Badge>
                </td>
                <td className="px-4 py-3 align-middle text-center">
                  <Switch
                    checked={row.enabled}
                    disabled={toggleMut.isPending}
                    onCheckedChange={(checked) => 
                      toggleMut.mutate({ key: row.key, enabled: checked })
                    }
                  />
                </td>
                <td className="px-4 py-3 align-middle text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="ghost">Manage</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => openEditModal(row)}>
                        Edit Configuration
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={() => {
                          if (window.confirm(`Delete feature flag '${row.key}'? This cannot be undone.`)) {
                            deleteMut.mutate(row.key);
                          }
                        }}
                      >
                        Delete Flag
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create Modal */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Feature Flag</DialogTitle>
            <DialogDescription>
              Define a new feature key. It will be disabled by default.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Flag Key</Label>
              <Input 
                placeholder="e.g. beta_dashboard_ui" 
                value={newKey} 
                onChange={(e) => setNewKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                className="font-mono text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Lowercase, numbers, and underscores only.</p>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea 
                placeholder="What does this flag control?" 
                value={newDesc} 
                onChange={(e) => setNewDesc(e.target.value)}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button disabled={!newKey || !newDesc || createMut.isPending} onClick={() => createMut.mutate()}>
              Create Flag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Configuration</DialogTitle>
            <DialogDescription className="font-mono text-xs mt-1">
              {selectedFlag?.key}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea 
                value={editDesc} 
                onChange={(e) => setEditDesc(e.target.value)}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>Rollout Percentage (0 - 100)</Label>
              <Input 
                type="number" 
                min={0} 
                max={100} 
                value={editPercent}
                onChange={(e) => setEditPercent(Number(e.target.value))}
              />
              <p className="text-[10px] text-muted-foreground">
                Set to 100% for full rollout, or a lower number for A/B testing and staged rollouts.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button disabled={updateMut.isPending} onClick={() => updateMut.mutate()}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}