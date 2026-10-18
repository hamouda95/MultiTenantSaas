"use client";
import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { Camera, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
/** Decode locally. No image, video or camera stream leaves the device. */
export function CameraScanner({
  onCode,
  disabled,
}: {
  onCode: (code: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const video = useRef<HTMLVideoElement>(null),
    callback = useRef(onCode);
  callback.current = onCode;
  useEffect(() => {
    if (!open) return;
    let cancelled = false,
      detected = false,
      controls: IScannerControls | undefined;
    const element = video.current;
    const stop = () => {
      controls?.stop();
      const stream = element?.srcObject;
      if (stream instanceof MediaStream)
        stream.getTracks().forEach((t) => t.stop());
      if (element) element.srcObject = null;
    };
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw Error(
            "Caméra indisponible. Utilisez HTTPS, une douchette ou la saisie manuelle.",
          );
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled || !element) return;
        const reader = new BrowserMultiFormatReader();
        controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
            },
          },
          element,
          (result, _error, c) => {
            if (cancelled || detected || !result) return;
            detected = true;
            c.stop();
            callback.current(result.getText());
            setOpen(false);
          },
        );
        if (cancelled) stop();
      } catch (e) {
        stop();
        if (!cancelled)
          setError(
            e instanceof Error && e.name === "NotAllowedError"
              ? "Accès caméra refusé. Autorisez-le dans le navigateur ou utilisez la douchette / saisie manuelle."
              : "Impossible de démarrer la caméra. Vérifiez ses autorisations et fermez les autres applications caméra. La saisie et la douchette restent disponibles.",
          );
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open]);
  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);
  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => {
          setError("");
          setOpen((v) => !v);
        }}
      >
        {open ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
        {open ? "Fermer la caméra" : "Scanner avec la caméra"}
      </Button>
      {open && (
        <div className="rounded-xl border border-accent bg-slate-950 p-3">
          <div className="relative overflow-hidden rounded-lg">
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              aria-label="Aperçu du scanner caméra"
              className="max-h-72 w-full object-contain"
            />
            <ScanLine
              aria-hidden
              className="pointer-events-none absolute left-1/4 top-1/3 h-1/3 w-1/2 text-cyan-300"
            />
          </div>
          <p className="mt-2 text-xs text-slate-200">
            Cadrez un seul code EAN / UPC / Code 128. Un scan ajoute une unité,
            puis ferme la caméra. Les images restent sur cet appareil.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
