import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Boxes, CheckCircle2, ArrowRightLeft, Undo2, PlusCircle, ScanLine, Bell, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — AssetTrack" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const [devices, history] = await Promise.all([
        supabase.from("devices").select("id, status, device_type, created_at").eq("created_by", user.id),
        supabase.from("device_history").select("id, status, return_date, issued_to_name, issue_date, created_at, device_id").eq("created_by", user.id),
      ]);
      if (devices.error) throw devices.error;
      if (history.error) throw history.error;

      // Only fetch alerts for devices owned by this admin
      const deviceIds = devices.data?.map(d => d.id) || [];
      const alertsRes = deviceIds.length > 0 
        ? await supabase.from("alerts").select("*").in("device_id", deviceIds).order("created_at", { ascending: false }).limit(15)
        : { data: [] };

      return {
        devices: devices.data ?? [],
        history: history.data ?? [],
        alerts: alertsRes.data ?? [],
      };
    },
  });

  const devices = data?.devices ?? [];
  const history = data?.history ?? [];
  const alerts = data?.alerts ?? [];

  const total = devices.length;
  const available = devices.filter((d) => d.status === "available").length;
  const issued = devices.filter((d) => d.status === "issued").length;
  const maintenance = devices.filter((d) => d.status === "maintenance").length;
  const returned = history.filter((h) => h.return_date).length;

  const byType = Object.entries(
    devices.reduce<Record<string, number>>((acc, d) => {
      acc[d.device_type] = (acc[d.device_type] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([type, count]) => ({ type, count }));

  const pieData = [
    { name: "Available", value: available, fill: "var(--color-chart-3)" },
    { name: "Issued", value: issued, fill: "var(--color-chart-1)" },
    { name: "Maintenance", value: maintenance, fill: "var(--color-chart-4)" },
  ].filter((p) => p.value > 0);

  const cards = [
    { label: "Total Devices", value: total, icon: Boxes, color: "var(--color-chart-1)" },
    { label: "Available", value: available, icon: CheckCircle2, color: "var(--color-chart-3)" },
    { label: "Issued", value: issued, icon: ArrowRightLeft, color: "var(--color-chart-4)" },
    { label: "Returned (all-time)", value: returned, icon: Undo2, color: "var(--color-chart-2)" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Overview of your tracked assets and QR activity alerts.</p>
        </div>
        <div className="flex gap-2">
          <Button asChild><Link to="/devices/new"><PlusCircle className="h-4 w-4" /> Add device</Link></Button>
          <Button variant="outline" asChild><Link to="/scan"><ScanLine className="h-4 w-4" /> Scan QR</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, color }) => (
          <Card key={label} style={{ boxShadow: "var(--shadow-card)" }}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">{label}</p>
                  <p className="text-3xl font-bold mt-2">{isLoading ? "—" : value}</p>
                </div>
                <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in oklab, ${color} 15%, transparent)`, color }}>
                  <Icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Real-time Alerts & Activity Feed */}
      <Card style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-amber-500" /> Recent Device Alerts & Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 && history.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-3 text-center">
              No recent issue or return events logged.
            </p>
          ) : (
            <div className="space-y-2.5">
              {alerts.length > 0
                ? alerts.map((alert) => (
                    <div
                      key={alert.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/60 text-sm gap-2"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                            alert.event_type === "returned"
                              ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                              : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          }`}
                        >
                          {alert.event_type === "returned" ? (
                            <Undo2 className="h-4 w-4" />
                          ) : (
                            <ArrowRightLeft className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{alert.message}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(alert.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      {alert.device_id && (
                        <Button size="sm" variant="ghost" asChild>
                          <Link to="/p/$id" params={{ id: alert.device_id }}>
                            View QR Page
                          </Link>
                        </Button>
                      )}
                    </div>
                  ))
                : history.slice(0, 5).map((h) => (
                    <div
                      key={h.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border bg-card/60 text-sm gap-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                          <Activity className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">
                            Device issued to {h.issued_to_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(h.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Devices by type</CardTitle></CardHeader>
          <CardContent className="h-72">
            {byType.length === 0 ? (
              <p className="text-sm text-muted-foreground">No devices yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byType}>
                  <XAxis dataKey="type" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
                  <Tooltip cursor={{ fill: "var(--color-muted)" }} />
                  <Bar dataKey="count" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Status breakdown</CardTitle></CardHeader>
          <CardContent className="h-72">
            {pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground">No devices yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {pieData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                  </Pie>
                  <Legend />
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
