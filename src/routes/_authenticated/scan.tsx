import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ScanLine, Camera, CameraOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/scan")({
  head: () => ({ meta: [{ title: "Scan QR — AssetTrack" }] }),
  component: ScanPage,
});

function ScanPage() {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const containerId = "qr-scanner";

  async function start() {
    setScanning(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner as unknown as typeof scannerRef.current;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decoded) => {
          handleResult(decoded);
          scanner.stop().then(() => scanner.clear()).catch(() => {});
          setScanning(false);
        },
        () => {},
      );
    } catch (e) {
      setScanning(false);
      toast.error((e as Error).message || "Cannot access camera");
    }
  }

  function handleResult(text: string) {
    try {
      const url = new URL(text);
      const m = url.pathname.match(/\/(?:p|devices)\/([^/?#]+)/);
      if (m) {
        toast.success("QR scanned");
        navigate({ to: "/p/$id", params: { id: m[1] } });
        return;
      }
    } catch {/* not a URL */}
    if (/^[0-9a-f-]{30,}$/i.test(text) || /^DEV-\d{4}-[A-Z0-9]+$/i.test(text)) {
      toast.success("QR scanned");
      navigate({ to: "/p/$id", params: { id: text } });
      return;
    }
    toast.error("Unrecognized QR code");
  }

  async function stop() {
    try {
      await scannerRef.current?.stop();
      scannerRef.current?.clear();
    } catch {/* noop */}
    setScanning(false);
  }

  useEffect(() => () => { stop(); }, []);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Scan QR code</h1>
        <p className="text-sm text-muted-foreground">Point your camera at a device QR code to open its details.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><ScanLine className="h-4 w-4" /> Camera</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div id={containerId} className="w-full rounded-lg overflow-hidden bg-muted" style={{ minHeight: scanning ? 300 : 0 }} />
          {!scanning ? (
            <Button onClick={start} className="w-full"><Camera className="h-4 w-4" /> Start scanner</Button>
          ) : (
            <Button onClick={stop} variant="outline" className="w-full"><CameraOff className="h-4 w-4" /> Stop scanner</Button>
          )}
          <p className="text-xs text-muted-foreground">Camera access is required. If denied, allow it in your browser settings.</p>
        </CardContent>
      </Card>
    </div>
  );
}
