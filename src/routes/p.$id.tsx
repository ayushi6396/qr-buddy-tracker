import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  QrCode,
  Calendar,
  UserCheck,
  Tag,
  MapPin,
  Box,
  ArrowRightLeft,
  Undo2,
  AlertCircle,
  Clock,
} from "lucide-react";

export const Route = createFileRoute("/p/$id")({
  head: () => ({
    meta: [
      { title: "Device Details — AssetTrack QR Scan" },
      { name: "description", content: "View asset details, issue dates, and return status by QR code." },
    ],
  }),
  component: PublicDeviceScanPage,
});

function statusBadgeVariant(status: string) {
  switch (status) {
    case "available":
      return "default";
    case "issued":
      return "secondary";
    default:
      return "outline";
  }
}

function PublicDeviceScanPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();

  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [issueDialogOpen, setIssueDialogOpen] = useState(false);
  const [returnerName, setReturnerName] = useState("");
  const [returnNotes, setReturnNotes] = useState("");

  const { data: device, isLoading, isError, error } = useQuery({
    queryKey: ["public-device", id],
    queryFn: async () => {
      // First try fetching by UUID id
      const { data, error } = await supabase
        .from("devices")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;

      // If not found by UUID, try device_code
      if (!data) {
        const { data: codeData, error: codeErr } = await supabase
          .from("devices")
          .select("*")
          .eq("device_code", id)
          .maybeSingle();
        if (codeErr) throw codeErr;
        if (!codeData) throw new Error("Device not found");
        return codeData;
      }

      return data;
    },
  });

  const deviceId = device?.id || id;

  const { data: history = [] } = useQuery({
    queryKey: ["public-device-history", deviceId],
    enabled: !!device,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_history")
        .select("*")
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const activeIssue = history.find((h) => !h.return_date && h.status === "issued");

  // Pre-fill returner name when activeIssue loads
  useEffect(() => {
    if (activeIssue?.issued_to_name) {
      setReturnerName(activeIssue.issued_to_name);
    }
  }, [activeIssue]);

  // Return Device Mutation
  const returnMut = useMutation({
    mutationFn: async () => {
      if (!activeIssue) throw new Error("No active issue record found for this device.");
      const today = new Date().toISOString().slice(0, 10);
      const name = returnerName.trim() || activeIssue.issued_to_name;

      // 1. Update history record
      const { error: hErr } = await supabase
        .from("device_history")
        .update({
          return_date: today,
          status: "returned",
          notes: returnNotes.trim() ? `Return Note: ${returnNotes.trim()}` : activeIssue.notes,
        })
        .eq("id", activeIssue.id);
      if (hErr) throw hErr;

      // 2. Update device status to available
      const { error: dErr } = await supabase
        .from("devices")
        .update({ status: "available" })
        .eq("id", deviceId);
      if (dErr) throw dErr;

      // 3. Log Alert notification
      const { error: alertErr } = await supabase.from("alerts").insert({
        device_id: deviceId,
        event_type: "returned",
        message: `Device ${device?.name || "Unknown"} (${device?.device_code}) was returned by ${name}.${returnNotes.trim() ? ` Note: "${returnNotes.trim()}"` : ""}`,
        user_name: name,
      });
      if (alertErr) console.error("Failed to log return alert:", alertErr);
    },
    onSuccess: () => {
      toast.success("Device successfully returned!");
      setReturnDialogOpen(false);
      setReturnNotes("");
      qc.invalidateQueries({ queryKey: ["public-device", id] });
      qc.invalidateQueries({ queryKey: ["public-device-history", deviceId] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Issue Device Mutation
  const issueSchema = z.object({
    issued_to_name: z.string().trim().min(1, "Name is required").max(120),
    issued_to_email: z.string().trim().email("Valid email required").max(255).or(z.literal("")),
    issue_date: z.string().min(1, "Issue date required"),
    expected_return_date: z.string().optional(),
  });

  const issueMut = useMutation({
    mutationFn: async (form: FormData) => {
      // Guard: prevent double-issue
      if (device?.status === "issued" || activeIssue) {
        throw new Error("This device is already issued. Please return it first.");
      }

      const parsed = issueSchema.safeParse({
        issued_to_name: form.get("issued_to_name"),
        issued_to_email: form.get("issued_to_email") || "",
        issue_date: form.get("issue_date"),
        expected_return_date: (form.get("expected_return_date") || "") as string,
      });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);

      // 1. Insert history record
      const { error: histErr } = await supabase.from("device_history").insert({
        device_id: deviceId,
        issued_to_name: parsed.data.issued_to_name,
        issued_to_email: parsed.data.issued_to_email || null,
        issue_date: parsed.data.issue_date,
        expected_return_date: parsed.data.expected_return_date || null,
        status: "issued",
      });
      if (histErr) throw histErr;

      // 2. Update device status to issued
      const { error: devErr } = await supabase
        .from("devices")
        .update({ status: "issued" })
        .eq("id", deviceId);
      if (devErr) throw devErr;

      // 3. Log Alert notification
      const { error: alertErr } = await supabase.from("alerts").insert({
        device_id: deviceId,
        event_type: "issued",
        message: `Device ${device?.name || "Unknown"} (${device?.device_code}) was issued to ${parsed.data.issued_to_name}.`,
        user_name: parsed.data.issued_to_name,
      });
      if (alertErr) console.error("Failed to log issue alert:", alertErr);
    },
    onSuccess: () => {
      toast.success("Device successfully issued!");
      setIssueDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["public-device", id] });
      qc.invalidateQueries({ queryKey: ["public-device-history", deviceId] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-4" />
        <p className="text-sm text-muted-foreground">Loading device details...</p>
      </div>
    );
  }

  if (isError || !device) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-2" />
            <CardTitle>Device Not Found</CardTitle>
            <CardDescription>
              {(error as Error)?.message || "The scanned QR code does not correspond to an existing device record."}
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button asChild variant="outline">
              <Link to="/">Go to Home</Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const isIssued = device.status === "issued" || !!activeIssue;

  return (
    <div className="min-h-screen bg-muted/20 pb-12">
      {/* Header */}
      <header className="border-b border-border bg-background sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-bold text-base">
            <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
              <QrCode className="h-4 w-4 text-primary-foreground" />
            </div>
            <span>AssetTrack</span>
          </Link>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/auth">Admin Login</Link>
          </Button>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        {/* Device Information Header Card */}
        <Card style={{ boxShadow: "var(--shadow-card)" }} className="overflow-hidden">
          <div
            className="h-3 w-full"
            style={{
              background: isIssued
                ? "linear-gradient(90deg, #f59e0b, #ea580c)"
                : "linear-gradient(90deg, #10b981, #059669)",
            }}
          />
          <CardHeader className="pb-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={statusBadgeVariant(device.status)} className="capitalize font-medium text-xs px-2.5 py-0.5">
                    {device.status}
                  </Badge>
                  <span className="text-xs font-mono text-muted-foreground">{device.device_code}</span>
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight">{device.name}</CardTitle>
                <CardDescription className="text-sm mt-1">{device.device_type}</CardDescription>
              </div>

              {/* Action Button: Return / Issue */}
              <div>
                {isIssued ? (
                  <Button
                    size="lg"
                    className="bg-amber-600 hover:bg-amber-700 text-white gap-2 shadow-md"
                    onClick={() => setReturnDialogOpen(true)}
                  >
                    <Undo2 className="h-5 w-5" />
                    Return Device
                  </Button>
                ) : (
                  <Button
                    size="lg"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 shadow-md"
                    onClick={() => setIssueDialogOpen(true)}
                  >
                    <ArrowRightLeft className="h-5 w-5" />
                    Issue Device
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          {/* Active Issue Status Banner */}
          {isIssued && activeIssue && (
            <CardContent className="pt-0 pb-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 dark:bg-amber-950/30 dark:border-amber-900/50 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-amber-200/60 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <Clock className="h-4 w-4" /> Active Issue Status
                  </span>
                  <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border-amber-300">
                    Checked Out
                  </Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground block">Issued To</span>
                    <span className="font-semibold text-foreground flex items-center gap-1.5 mt-0.5">
                      <UserCheck className="h-4 w-4 text-amber-600" />
                      {activeIssue.issued_to_name}
                    </span>
                    {activeIssue.issued_to_email && (
                      <span className="text-xs text-muted-foreground block truncate">{activeIssue.issued_to_email}</span>
                    )}
                  </div>

                  <div>
                    <span className="text-xs text-muted-foreground block">Issued Date</span>
                    <span className="font-medium text-foreground flex items-center gap-1.5 mt-0.5">
                      <Calendar className="h-4 w-4 text-amber-600" />
                      {new Date(activeIssue.issue_date).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>

                  <div>
                    <span className="text-xs text-muted-foreground block">Expected Return</span>
                    <span className="font-medium text-foreground flex items-center gap-1.5 mt-0.5">
                      <Calendar className="h-4 w-4 text-amber-600" />
                      {activeIssue.expected_return_date
                        ? new Date(activeIssue.expected_return_date).toLocaleDateString(undefined, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })
                        : "Not specified"}
                    </span>
                  </div>
                </div>

                <div className="pt-1 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-300 text-amber-900 bg-amber-100/50 hover:bg-amber-200/70 dark:text-amber-200"
                    onClick={() => setReturnDialogOpen(true)}
                  >
                    <Undo2 className="h-4 w-4 mr-1.5" /> Return Now
                  </Button>
                </div>
              </div>
            </CardContent>
          )}

          {/* Device Specifications Grid */}
          <CardContent className="pt-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              Device Specifications
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm bg-accent/30 p-4 rounded-xl border border-border">
              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" /> Serial Number
                </span>
                <p className="font-mono font-medium text-foreground mt-0.5">{device.serial_number || "—"}</p>
              </div>

              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> Location / Lab
                </span>
                <p className="font-medium text-foreground mt-0.5">{device.location || "Unassigned"}</p>
              </div>

              <div>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Box className="h-3.5 w-3.5" /> Device Category
                </span>
                <p className="font-medium text-foreground mt-0.5">{device.device_type}</p>
              </div>

              {device.purchase_date && (
                <div>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" /> Purchase Date
                  </span>
                  <p className="font-medium text-foreground mt-0.5">
                    {new Date(device.purchase_date).toLocaleDateString()}
                  </p>
                </div>
              )}

              {device.notes && (
                <div className="col-span-2">
                  <span className="text-xs text-muted-foreground">Notes</span>
                  <p className="text-xs text-foreground mt-0.5">{device.notes}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Device Issue & Return History Log */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" /> Activity & History Log
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground italic text-center py-4">
                No previous issue/return history recorded for this asset.
              </p>
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between p-3 rounded-lg border border-border bg-card text-sm gap-2"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{item.issued_to_name}</span>
                        <Badge
                          variant={item.return_date ? "outline" : "secondary"}
                          className="text-[10px] px-2 py-0"
                        >
                          {item.return_date ? "Returned" : "Active"}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                        <span>Issued: {new Date(item.issue_date).toLocaleDateString()}</span>
                        {item.return_date ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            Returned: {new Date(item.return_date).toLocaleDateString()}
                          </span>
                        ) : item.expected_return_date ? (
                          <span>Expected: {new Date(item.expected_return_date).toLocaleDateString()}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* RETURN DEVICE DIALOG MODAL */}
      <Dialog open={returnDialogOpen} onOpenChange={setReturnDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl text-amber-700 dark:text-amber-400">
              <Undo2 className="h-5 w-5" /> Return Device
            </DialogTitle>
            <DialogDescription>
              Process the return of <strong>{device.name || "Unknown Device"}</strong> ({device.device_code}). This will mark the device as available in the Admin Portal.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="returnerName">Returned By (Name)</Label>
              <Input
                id="returnerName"
                value={returnerName}
                onChange={(e) => setReturnerName(e.target.value)}
                placeholder="Enter person's name returning the device"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="returnNotes">Return Notes (Optional)</Label>
              <Textarea
                id="returnNotes"
                value={returnNotes}
                onChange={(e) => setReturnNotes(e.target.value)}
                placeholder="e.g. Returned in good condition to Lab 2"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setReturnDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={returnMut.isPending}
              onClick={() => returnMut.mutate()}
            >
              {returnMut.isPending ? "Processing..." : "Confirm Return"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ISSUE DEVICE DIALOG MODAL */}
      <Dialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl text-emerald-700 dark:text-emerald-400">
              <ArrowRightLeft className="h-5 w-5" /> Issue Device
            </DialogTitle>
            <DialogDescription>
              Assign <strong>{device.name || "Unknown Device"}</strong> ({device.device_code}) to a user or student.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              issueMut.mutate(new FormData(e.currentTarget));
            }}
            className="space-y-4 py-2"
          >
            <div className="space-y-1.5">
              <Label htmlFor="issued_to_name">Full Name *</Label>
              <Input id="issued_to_name" name="issued_to_name" required placeholder="e.g. Jane Doe" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="issued_to_email">Email Address</Label>
              <Input
                id="issued_to_email"
                name="issued_to_email"
                type="email"
                placeholder="e.g. jane@example.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="issue_date">Issue Date *</Label>
                <Input
                  id="issue_date"
                  name="issue_date"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="expected_return_date">Expected Return</Label>
                <Input id="expected_return_date" name="expected_return_date" type="date" />
              </div>
            </div>

            <DialogFooter className="pt-2 gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setIssueDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={issueMut.isPending}>
                {issueMut.isPending ? "Issuing..." : "Confirm Issue"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
