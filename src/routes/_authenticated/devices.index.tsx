import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, Pencil, Trash2, PlusCircle, Search } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/devices/")({
  head: () => ({ meta: [{ title: "Devices — AssetTrack" }] }),
  component: DevicesList,
});

function statusVariant(status: string) {
  switch (status) {
    case "available": return "default";
    case "issued": return "secondary";
    case "maintenance": return "outline";
    default: return "outline";
  }
}

function DevicesList() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ["devices"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("devices")
        .select("*")
        .eq("created_by", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("devices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Device deleted"); qc.invalidateQueries({ queryKey: ["devices"] }); qc.invalidateQueries({ queryKey: ["dashboard-stats"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const q = search.trim().toLowerCase();
  const filtered = q
    ? devices.filter((d) =>
        d.name.toLowerCase().includes(q) ||
        d.device_code.toLowerCase().includes(q) ||
        d.device_type.toLowerCase().includes(q) ||
        d.serial_number.toLowerCase().includes(q),
      )
    : devices;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Devices</h1>
          <p className="text-sm text-muted-foreground">All tracked devices in your inventory.</p>
        </div>
        <Button asChild><Link to="/devices/new"><PlusCircle className="h-4 w-4" /> Add device</Link></Button>
      </div>

      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name, ID, type, or serial…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Device ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="hidden md:table-cell">Serial</TableHead>
              <TableHead className="hidden md:table-cell">Location</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                {devices.length === 0 ? "No devices yet. Add your first one!" : "No matches."}
              </TableCell></TableRow>
            ) : filtered.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-mono text-xs">{d.device_code}</TableCell>
                <TableCell className="font-medium">{d.name}</TableCell>
                <TableCell>{d.device_type}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{d.serial_number}</TableCell>
                <TableCell className="hidden md:table-cell text-muted-foreground">{d.location || "—"}</TableCell>
                <TableCell><Badge variant={statusVariant(d.status)} className="capitalize">{d.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="inline-flex gap-1">
                    <Button size="icon" variant="ghost" asChild title="View"><Link to="/devices/$id" params={{ id: d.id }}><Eye className="h-4 w-4" /></Link></Button>
                    <Button size="icon" variant="ghost" asChild title="Edit"><Link to="/devices/$id" params={{ id: d.id }}><Pencil className="h-4 w-4" /></Link></Button>
                    <Button size="icon" variant="ghost" title="Delete" onClick={() => setToDelete({ id: d.id, name: d.name })}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this device?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.name}" and its issue history will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (toDelete) del.mutate(toDelete.id); setToDelete(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
