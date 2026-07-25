import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";
import { deviceUrl } from "@/lib/device-code";
import { ArrowLeft, Save, ArrowRightLeft, Undo2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/devices/$id")({
  head: () => ({ meta: [{ title: "Device Details — AssetTrack" }] }),
  component: DeviceDetails,
});

function statusVariant(status: string) {
  switch (status) {
    case "available": return "default";
    case "issued": return "secondary";
    default: return "outline";
  }
}

function DeviceDetails() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: device, isLoading } = useQuery({
    queryKey: ["device", id],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("devices")
        .select("*")
        .eq("id", id)
        .eq("created_by", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: history = [] } = useQuery({
    queryKey: ["device-history", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("device_history").select("*").eq("device_id", id).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const activeIssue = history.find((h) => !h.return_date && h.status === "issued");

  const issueSchema = z.object({
    issued_to_name: z.string().trim().min(1, "Name required").max(120),
    issued_to_email: z.string().trim().email("Valid email required").max(255).or(z.literal("")),
    issue_date: z.string().min(1, "Issue date required"),
    expected_return_date: z.string().optional(),
  });

  const issueMut = useMutation({
    mutationFn: async (form: FormData) => {
      // Guard: prevent double-issue
      if (device?.status === "issued" || activeIssue) {
        throw new Error("This device is already issued. Return it first.");
      }

      const parsed = issueSchema.safeParse({
        issued_to_name: form.get("issued_to_name"),
        issued_to_email: form.get("issued_to_email") || "",
        issue_date: form.get("issue_date"),
        expected_return_date: (form.get("expected_return_date") || "") as string,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const { data: user } = await supabase.auth.getUser();
      const { error: histErr } = await supabase.from("device_history").insert({
        device_id: id,
        issued_to_name: parsed.data.issued_to_name,
        issued_to_email: parsed.data.issued_to_email || null,
        issue_date: parsed.data.issue_date,
        expected_return_date: parsed.data.expected_return_date || null,
        status: "issued",
        created_by: user.user?.id,
      });
      if (histErr) throw histErr;
      const { error: devErr } = await supabase.from("devices").update({ status: "issued" }).eq("id", id);
      if (devErr) throw devErr;

      // 3. Log Alert notification
      const { error: alertErr } = await supabase.from("alerts").insert({
        device_id: id,
        event_type: "issued",
        message: `Device ${device?.name || "Unknown"} (${device?.device_code}) was issued to ${parsed.data.issued_to_name} (by admin).`,
        user_name: parsed.data.issued_to_name,
      });
      if (alertErr) console.error("Failed to log issue alert:", alertErr);
    },
    onSuccess: () => {
      toast.success("Device issued");
      qc.invalidateQueries({ queryKey: ["device", id] });
      qc.invalidateQueries({ queryKey: ["device-history", id] });
      qc.invalidateQueries({ queryKey: ["devices"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const returnMut = useMutation({
    mutationFn: async () => {
      if (!activeIssue) throw new Error("No active issue to return");
      const today = new Date().toISOString().slice(0, 10);
      const { error: hErr } = await supabase.from("device_history").update({ return_date: today, status: "returned" }).eq("id", activeIssue.id);
      if (hErr) throw hErr;
      const { error: dErr } = await supabase.from("devices").update({ status: "available" }).eq("id", id);
      if (dErr) throw dErr;

      // 3. Log Alert notification
      const { error: alertErr } = await supabase.from("alerts").insert({
        device_id: id,
        event_type: "returned",
        message: `Device ${device?.name || "Unknown"} (${device?.device_code}) was returned (by admin).${returnNotes.trim() ? ` Note: "${returnNotes.trim()}"` : ""}`,
        user_name: activeIssue.issued_to_name,
      });
      if (alertErr) console.error("Failed to log return alert:", alertErr);
    },
    onSuccess: () => {
      toast.success("Device returned");
      qc.invalidateQueries({ queryKey: ["device", id] });
      qc.invalidateQueries({ queryKey: ["device-history", id] });
      qc.invalidateQueries({ queryKey: ["devices"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMut = useMutation({
    mutationFn: async (form: FormData) => {
      const { error } = await supabase.from("devices").update({
        name: String(form.get("name") || "").trim(),
        device_type: String(form.get("device_type") || "").trim(),
        serial_number: String(form.get("serial_number") || "").trim(),
        location: String(form.get("location") || "").trim() || null,
        status: String(form.get("status") || "available"),
        notes: String(form.get("notes") || "").trim() || null,
      }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Device updated"); setEditing(false);
      qc.invalidateQueries({ queryKey: ["device", id] });
      qc.invalidateQueries({ queryKey: ["devices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("devices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Device deleted"); navigate({ to: "/devices" }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;
  if (!device) return (
    <div className="text-center py-20">
      <p className="text-muted-foreground mb-4">Device not found.</p>
      <Button asChild><Link to="/devices">Back to devices</Link></Button>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Button variant="ghost" asChild><Link to="/devices"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>
        <div className="flex gap-2">
          {!editing && <Button variant="outline" onClick={() => setEditing(true)}>Edit</Button>}
          <Button variant="outline" className="text-destructive" onClick={() => { if (confirm("Delete this device?")) delMut.mutate(); }}>Delete</Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* LEFT: Info + QR + history */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle>{device.name}</CardTitle>
                  <p className="text-sm font-mono text-muted-foreground mt-1">{device.device_code}</p>
                </div>
                <Badge variant={statusVariant(device.status)} className="capitalize">{device.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!editing ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Info label="Type" value={device.device_type} />
                  <Info label="Serial" value={device.serial_number} />
                  <Info label="Purchase date" value={device.purchase_date || "—"} />
                  <Info label="Location" value={device.location || "—"} />
                  {device.notes && <div className="col-span-2"><Info label="Notes" value={device.notes} /></div>}
                </dl>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); editMut.mutate(new FormData(e.currentTarget)); }} className="grid gap-3 md:grid-cols-2">
                  <Field label="Name" name="name" defaultValue={device.name} required />
                  <Field label="Type" name="device_type" defaultValue={device.device_type} required />
                  <Field label="Serial" name="serial_number" defaultValue={device.serial_number} required />
                  <Field label="Location" name="location" defaultValue={device.location || ""} />
                  <div>
                    <Label>Status</Label>
                    <select name="status" defaultValue={device.status} className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="available">Available</option>
                      <option value="issued">Issued</option>
                      <option value="maintenance">Maintenance</option>
                    </select>
                  </div>
                  <div className="md:col-span-2"><Label>Notes</Label><Input name="notes" defaultValue={device.notes || ""} /></div>
                  <div className="md:col-span-2 flex justify-end gap-2">
                    <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                    <Button type="submit"><Save className="h-4 w-4" /> Save</Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">QR code</CardTitle></CardHeader>
            <CardContent><QRCodeDisplay value={deviceUrl(device.id)} label={device.device_code} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Issue history</CardTitle></CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No issue records yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {history.map((h) => (
                    <li key={h.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{h.issued_to_name}</p>
                        <p className="text-xs text-muted-foreground">
                          Issued {h.issue_date}{h.expected_return_date ? ` · Expected ${h.expected_return_date}` : ""}
                          {h.return_date ? ` · Returned ${h.return_date}` : ""}
                        </p>
                      </div>
                      <Badge variant={h.return_date ? "outline" : "secondary"} className="capitalize">{h.return_date ? "returned" : "issued"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* RIGHT: Issue / Return */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{activeIssue ? "Currently issued" : "Issue this device"}</CardTitle>
            </CardHeader>
            <CardContent>
              {activeIssue ? (
                <div className="space-y-4">
                  <dl className="grid grid-cols-2 gap-y-3 text-sm">
                    <Info label="Issued to" value={activeIssue.issued_to_name} />
                    <Info label="Email" value={activeIssue.issued_to_email || "—"} />
                    <Info label="Issue date" value={activeIssue.issue_date} />
                    <Info label="Expected return" value={activeIssue.expected_return_date || "—"} />
                  </dl>
                  <Button className="w-full" onClick={() => returnMut.mutate()} disabled={returnMut.isPending}>
                    <Undo2 className="h-4 w-4" /> {returnMut.isPending ? "Returning…" : "Return device"}
                  </Button>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); issueMut.mutate(new FormData(e.currentTarget)); }} className="space-y-4">
                  <Field label="Issued to (name)" name="issued_to_name" required />
                  <Field label="Email" name="issued_to_email" type="email" />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Issue date" name="issue_date" type="date" required defaultValue={new Date().toISOString().slice(0,10)} />
                    <Field label="Expected return" name="expected_return_date" type="date" />
                  </div>
                  <Button type="submit" className="w-full" disabled={issueMut.isPending || device.status === "maintenance"}>
                    <ArrowRightLeft className="h-4 w-4" /> {issueMut.isPending ? "Issuing…" : "Issue device"}
                  </Button>
                  {device.status === "maintenance" && <p className="text-xs text-warning">This device is under maintenance.</p>}
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-medium mt-0.5 break-words">{value}</dd>
    </div>
  );
}

function Field({ label, name, type = "text", required, defaultValue }: { label: string; name: string; type?: string; required?: boolean; defaultValue?: string }) {
  return (
    <div>
      <Label htmlFor={name}>{label}{required && " *"}</Label>
      <Input id={name} name={name} type={type} required={required} defaultValue={defaultValue} />
    </div>
  );
}

