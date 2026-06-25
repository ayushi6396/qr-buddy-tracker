import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";
import { generateDeviceCode, deviceUrl } from "@/lib/device-code";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/devices/new")({
  head: () => ({ meta: [{ title: "Add Device — AssetTrack" }] }),
  component: AddDevice,
});

const schema = z.object({
  name: z.string().trim().min(1, "Device name required").max(120),
  device_type: z.string().trim().min(1, "Device type required").max(60),
  serial_number: z.string().trim().min(1, "Serial number required").max(80),
  purchase_date: z.string().optional(),
  location: z.string().trim().max(120).optional(),
  status: z.enum(["available", "issued", "maintenance"]),
  notes: z.string().max(500).optional(),
});

function AddDevice() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ id: string; code: string; name: string } | null>(null);
  const [status, setStatus] = useState<"available" | "issued" | "maintenance">("available");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const parsed = schema.safeParse({
      name: fd.get("name"),
      device_type: fd.get("device_type"),
      serial_number: fd.get("serial_number"),
      purchase_date: (fd.get("purchase_date") || "") as string,
      location: (fd.get("location") || "") as string,
      status,
      notes: (fd.get("notes") || "") as string,
    });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }

    setLoading(true);
    const code = generateDeviceCode();
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("devices").insert({
      device_code: code,
      name: parsed.data.name,
      device_type: parsed.data.device_type,
      serial_number: parsed.data.serial_number,
      purchase_date: parsed.data.purchase_date || null,
      location: parsed.data.location || null,
      status: parsed.data.status,
      notes: parsed.data.notes || null,
      created_by: user.user?.id,
    }).select().single();
    setLoading(false);

    if (error) return toast.error(error.message);
    toast.success(`Device added — ${code}`);
    qc.invalidateQueries({ queryKey: ["devices"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    setCreated({ id: data.id, code: data.device_code, name: data.name });
  }

  if (created) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <Button variant="ghost" asChild><Link to="/devices"><ArrowLeft className="h-4 w-4" /> Back to devices</Link></Button>
        <Card>
          <CardHeader>
            <CardTitle>Device created</CardTitle>
            <p className="text-sm text-muted-foreground">Print or download this QR code and attach it to <span className="font-medium text-foreground">{created.name}</span>.</p>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <p className="font-mono text-sm">{created.code}</p>
            <QRCodeDisplay value={deviceUrl(created.id)} label={created.code} />
            <div className="flex gap-2 pt-2">
              <Button asChild><Link to="/devices/$id" params={{ id: created.id }}>View device</Link></Button>
              <Button variant="outline" onClick={() => { setCreated(null); navigate({ to: "/devices/new" }); }}>Add another</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <Button variant="ghost" asChild><Link to="/devices"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight mt-2">Add new device</h1>
        <p className="text-sm text-muted-foreground">A unique Device ID and QR code will be generated automatically.</p>
      </div>
      <Card>
        <CardContent className="p-6">
          <form onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2"><Label htmlFor="name">Device name *</Label><Input id="name" name="name" required maxLength={120} /></div>
            <div><Label htmlFor="device_type">Device type *</Label><Input id="device_type" name="device_type" required placeholder="Laptop, Microscope…" /></div>
            <div><Label htmlFor="serial_number">Serial number *</Label><Input id="serial_number" name="serial_number" required /></div>
            <div><Label htmlFor="purchase_date">Purchase date</Label><Input id="purchase_date" name="purchase_date" type="date" /></div>
            <div><Label htmlFor="location">Location</Label><Input id="location" name="location" placeholder="Lab 3, Block A" /></div>
            <div>
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="issued">Issued</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2"><Label htmlFor="notes">Notes</Label><Textarea id="notes" name="notes" rows={3} maxLength={500} /></div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="outline" type="button" asChild><Link to="/devices">Cancel</Link></Button>
              <Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save device"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
