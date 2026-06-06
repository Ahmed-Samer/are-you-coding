import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getWebhookEndpoints,
  toggleWebhookEndpoint,
  deleteWebhookEndpoint,
  getWebhookEvents,
  retryWebhookEvent,
  createWebhookEndpoint,
  getWebhookTenants
} from "@/lib/webhooks-admin.functions";

type EndpointRow = {
  id: string;
  url: string;
  events: string[];
  is_active: boolean;
  description: string | null;
  created_at: string;
  tenants: { name: string; slug: string } | null;
};

type EventRow = {
  id: string;
  event_type: string;
  status: string;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  webhook_endpoints: { url: string } | null;
  tenants: { name: string } | null;
};

export function WebhookEventsTable() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("endpoints");
  const [eventPage, setEventPage] = useState(1);

  // Create Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newTenantId, setNewTenantId] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newEvents, setNewEvents] = useState("order.created");
  const [newDesc, setNewDesc] = useState("");

  const endpointsQuery = useQuery({
    queryKey: ["admin", "webhooks", "endpoints"],
    queryFn: () => getWebhookEndpoints(),
    enabled: activeTab === "endpoints"
  });

  const eventsQuery = useQuery({
    queryKey: ["admin", "webhooks", "events", eventPage],
    queryFn: () => getWebhookEvents({ data: { page: eventPage, pageSize: 20, statusFilter: "all" } }),
    enabled: activeTab === "events"
  });

  // Fetch tenants for the dropdown inside the modal
  const tenantsQuery = useQuery({
    queryKey: ["admin", "webhooks", "tenants"],
    queryFn: () => getWebhookTenants(),
    enabled: isCreateOpen
  });

  const endpoints: EndpointRow[] = (endpointsQuery.data as EndpointRow[]) ?? [];
  const events: EventRow[] = (eventsQuery.data?.events as EventRow[]) ?? [];
  const eventsTotal = eventsQuery.data?.total ?? 0;
  const tenantOptions = (tenantsQuery.data as { id: string; name: string }[]) ?? [];

  // Mutations
  const createEndpointMut = useMutation({
    mutationFn: () => createWebhookEndpoint({
      data: {
        tenantId: newTenantId,
        url: newUrl,
        secret: crypto.randomUUID().replace(/-/g, ''), // Auto-generate secure 32-char secret
        events: newEvents.split(',').map(e => e.trim()).filter(Boolean),
        description: newDesc
      }
    }),
    onSuccess: () => {
      toast.success("Webhook endpoint successfully created!");
      queryClient.invalidateQueries({ queryKey: ["admin", "webhooks", "endpoints"] });
      setIsCreateOpen(false);
      setNewTenantId(""); setNewUrl(""); setNewEvents("order.created"); setNewDesc("");
    },
    onError: (err: Error) => toast.error(`Creation failed: ${err.message}`)
  });

  const toggleEndpointMut = useMutation({
    mutationFn: (data: { id: string; isActive: boolean }) => toggleWebhookEndpoint({ data }),
    onSuccess: () => {
      toast.success("Endpoint status updated.");
      queryClient.invalidateQueries({ queryKey: ["admin", "webhooks", "endpoints"] });
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`)
  });

  const deleteEndpointMut = useMutation({
    mutationFn: (id: string) => deleteWebhookEndpoint({ data: { id } }),
    onSuccess: () => {
      toast.success("Endpoint deleted permanently.");
      queryClient.invalidateQueries({ queryKey: ["admin", "webhooks", "endpoints"] });
    },
    onError: (err: Error) => toast.error(`Failed to delete: ${err.message}`)
  });

  const retryEventMut = useMutation({
    mutationFn: (eventId: string) => retryWebhookEvent({ data: { eventId } }),
    onSuccess: () => {
      toast.success("Event queued for retry.");
      queryClient.invalidateQueries({ queryKey: ["admin", "webhooks", "events"] });
    },
    onError: (err: Error) => toast.error(`Retry failed: ${err.message}`)
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success": return "default";
      case "failed": return "destructive";
      case "pending": return "secondary";
      default: return "outline";
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Webhooks Management</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Configure external integrations and monitor event deliveries.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <TabsList className="h-8">
              <TabsTrigger value="endpoints" className="text-xs">Endpoints</TabsTrigger>
              <TabsTrigger value="events" className="text-xs">Delivery Logs</TabsTrigger>
            </TabsList>
            {activeTab === "endpoints" && (
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>Add Endpoint</Button>
            )}
          </div>
        </div>

        {/* ENDPOINTS TAB */}
        <TabsContent value="endpoints" className="m-0 border-0 p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Tenant</th>
                  <th className="text-left px-4 py-2 font-medium">Endpoint URL</th>
                  <th className="text-left px-4 py-2 font-medium">Subscribed Events</th>
                  <th className="text-center px-4 py-2 font-medium">Status</th>
                  <th className="text-right px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {endpointsQuery.isLoading && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">Loading endpoints...</td></tr>
                )}
                {!endpointsQuery.isLoading && endpoints.length === 0 && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No webhook endpoints configured.</td></tr>
                )}
                {endpoints.map((ep) => (
                  <tr key={ep.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 align-top">
                      <span className="font-medium">{ep.tenants?.name || "Global"}</span>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-mono text-xs truncate max-w-[250px]" title={ep.url}>{ep.url}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">{ep.description || "No description"}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {ep.events.map((ev, i) => (
                          <Badge key={i} variant="outline" className="text-[10px]">{ev}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-center">
                      <Switch
                        checked={ep.is_active}
                        disabled={toggleEndpointMut.isPending}
                        onCheckedChange={(checked) => toggleEndpointMut.mutate({ id: ep.id, isActive: checked })}
                      />
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      <Button size="sm" variant="destructive" onClick={() => { if (window.confirm("Delete this endpoint?")) deleteEndpointMut.mutate(ep.id); }}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* EVENTS TAB */}
        <TabsContent value="events" className="m-0 border-0 p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground bg-muted/40">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Event Type</th>
                  <th className="text-left px-4 py-2 font-medium">Target URL</th>
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                  <th className="text-center px-4 py-2 font-medium">Attempts</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-right px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {eventsQuery.isLoading && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading events...</td></tr>}
                {!eventsQuery.isLoading && events.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No delivery logs found.</td></tr>}
                {events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 align-top">
                      <div className="font-medium text-xs">{ev.event_type}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">{ev.tenants?.name || "Global"}</div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="font-mono text-xs truncate max-w-[200px]" title={ev.webhook_endpoints?.url || "Deleted Endpoint"}>
                        {ev.webhook_endpoints?.url || "N/A"}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(ev.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 align-top text-center font-mono text-xs">{ev.attempt_count}</td>
                    <td className="px-4 py-3 align-top">
                      <Badge variant={getStatusBadge(ev.status)} className="capitalize text-[10px]">{ev.status}</Badge>
                      {ev.last_error && <div className="text-[10px] text-destructive mt-1 max-w-[150px] truncate" title={ev.last_error}>{ev.last_error}</div>}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      {ev.status !== "success" && (
                         <Button size="sm" variant="outline" disabled={retryEventMut.isPending} onClick={() => retryEventMut.mutate(ev.id)}>
                           Retry
                         </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="p-4 border-t border-border flex items-center justify-between">
            <div className="text-xs text-muted-foreground">Showing {events.length} of {eventsTotal} events</div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={eventPage === 1} onClick={() => setEventPage(p => p - 1)}>Prev</Button>
              <Button size="sm" variant="outline" disabled={events.length < 20} onClick={() => setEventPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* CREATE ENDPOINT MODAL */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Webhook Endpoint</DialogTitle>
            <DialogDescription>
              Register a new URL to receive real-time updates.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            
            <div className="space-y-2">
              <Label>Select Tenant</Label>
              <Select value={newTenantId} onValueChange={setNewTenantId} disabled={tenantsQuery.isLoading}>
                <SelectTrigger>
                  <SelectValue placeholder={tenantsQuery.isLoading ? "Loading tenants..." : "Choose a tenant..."} />
                </SelectTrigger>
                <SelectContent>
                  {tenantOptions.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Endpoint URL</Label>
              <Input 
                type="url"
                placeholder="https://api.example.com/webhook" 
                value={newUrl} 
                onChange={(e) => setNewUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Events to Subscribe (comma separated)</Label>
              <Input 
                placeholder="order.created, product.updated" 
                value={newEvents} 
                onChange={(e) => setNewEvents(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (Optional)</Label>
              <Textarea 
                placeholder="What is this endpoint used for?" 
                value={newDesc} 
                onChange={(e) => setNewDesc(e.target.value)}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancel</Button>
            <Button 
              disabled={!newTenantId || !newUrl || !newEvents || createEndpointMut.isPending} 
              onClick={() => createEndpointMut.mutate()}
            >
              Save Endpoint
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}