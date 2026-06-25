import { createFileRoute, Link } from "@tanstack/react-router";
import { QrCode, ShieldCheck, BarChart3, Scan } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AssetTrack — QR-Based Smart Device Tracking" },
      { name: "description", content: "Manage and track electronic devices using QR codes. Designed for colleges, laboratories, and organizations." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
              <QrCode className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-lg">AssetTrack</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" asChild><Link to="/auth">Sign in</Link></Button>
            <Button asChild><Link to="/auth">Get started</Link></Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-20 md:py-28 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-accent/40 px-3 py-1 text-xs font-medium text-accent-foreground mb-6">
          <Scan className="h-3.5 w-3.5" /> Smart device tracking with QR codes
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
          <span className="bg-clip-text text-transparent" style={{ backgroundImage: "var(--gradient-hero)" }}>
            Track every device.
          </span>
          <br />Never lose a lab asset again.
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          A modern asset management system for colleges, labs, and organizations. Generate unique QR codes, scan to view details, and manage issue & return history — all in one place.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button size="lg" asChild><Link to="/auth">Open admin dashboard</Link></Button>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20 grid md:grid-cols-3 gap-6">
        {[
          { icon: QrCode, title: "Auto QR generation", text: "Every new device gets a unique ID and printable QR code instantly." },
          { icon: Scan, title: "Camera scanning", text: "Scan a device QR with your phone or webcam to jump straight to its record." },
          { icon: BarChart3, title: "Live dashboard", text: "Track total, available, issued, and returned devices with rich charts." },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border border-border bg-card p-6" style={{ boxShadow: "var(--shadow-card)" }}>
            <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="font-semibold mb-1">{title}</h3>
            <p className="text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>

      <footer className="border-t border-border py-6 text-center text-sm text-muted-foreground">
        <ShieldCheck className="inline h-4 w-4 mr-1 text-primary" /> Secure admin authentication built-in
      </footer>
    </div>
  );
}
