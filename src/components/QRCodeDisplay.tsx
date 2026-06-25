import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";

interface Props {
  value: string;
  label?: string;
  size?: number;
}

export function QRCodeDisplay({ value, label, size = 220 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, value, { width: size, margin: 1, color: { dark: "#1e3a8a", light: "#ffffff" } });
    QRCode.toDataURL(value, { width: 600, margin: 2 }).then(setDataUrl);
  }, [value, size]);

  function download() {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${label || "device"}-qr.png`;
    a.click();
  }

  function print() {
    if (!dataUrl) return;
    const w = window.open("", "_blank", "width=400,height=500");
    if (!w) return;
    w.document.write(`<html><head><title>${label || "QR"}</title></head><body style="font-family:sans-serif;text-align:center;padding:24px;">
      <h2 style="margin:0 0 12px;">${label || ""}</h2>
      <img src="${dataUrl}" style="max-width:300px;" />
      <p style="font-family:monospace;font-size:12px;">${value}</p>
      <script>window.onload=()=>{window.print();window.close();}</script>
    </body></html>`);
    w.document.close();
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-xl border border-border bg-white p-3">
        <canvas ref={canvasRef} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={download}><Download className="h-4 w-4" /> Download</Button>
        <Button size="sm" variant="outline" onClick={print}><Printer className="h-4 w-4" /> Print</Button>
      </div>
    </div>
  );
}
