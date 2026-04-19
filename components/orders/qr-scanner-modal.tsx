"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void | Promise<void>;
};

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorCtor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

export default function QrScannerModal({
  open,
  title = "QR-Code scannen",
  onClose,
  onScanSuccess,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const frameLoopRef = useRef<number | null>(null);
  const hasScannedRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [scanningImage, setScanningImage] = useState(false);
  const [lastScanText, setLastScanText] = useState("");
  const [modeLabel, setModeLabel] = useState("");

  function triggerSuccessFeedback() {
    try {
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.([120, 60, 120]);
      }
    } catch {
      // nicht kritisch
    }

    try {
      const AudioContextCtor =
        (window as any).AudioContext || (window as any).webkitAudioContext;

      if (!AudioContextCtor) return;

      const audioContext = new AudioContextCtor();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, audioContext.currentTime);

      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.15,
        audioContext.currentTime + 0.01
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        audioContext.currentTime + 0.18
      );

      oscillator.connect(gain);
      gain.connect(audioContext.destination);

      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.18);

      oscillator.onended = () => {
        audioContext.close().catch(() => {});
      };
    } catch {
      // nicht kritisch
    }
  }

  async function handleDetectedText(decodedText: string) {
    if (hasScannedRef.current) return;
    hasScannedRef.current = true;

    setLastScanText(decodedText);
    triggerSuccessFeedback();

    try {
      await onScanSuccess(decodedText);
    } catch (err) {
      console.error("Scan-Erfolg konnte nicht verarbeitet werden:", err);
      hasScannedRef.current = false;
    }
  }

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    hasScannedRef.current = false;

    async function startNativeBarcodeDetector() {
      const BarcodeDetectorApi = (window as any)
        .BarcodeDetector as BarcodeDetectorCtor | undefined;

      if (!BarcodeDetectorApi) {
        throw new Error("BarcodeDetector nicht verfügbar");
      }

      const detector = new BarcodeDetectorApi({
        formats: ["qr_code"],
      });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      mediaStreamRef.current = stream;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || !canvas) {
        throw new Error("Video-Element nicht verfügbar.");
      }

      video.srcObject = stream;
      video.setAttribute("playsinline", "true");
      video.muted = true;

      await video.play();

      const track = stream.getVideoTracks()[0];

      try {
        const capabilities = track.getCapabilities?.() as any;

        if (
          capabilities?.focusMode &&
          Array.isArray(capabilities.focusMode) &&
          capabilities.focusMode.includes("continuous")
        ) {
          await (track as any).applyConstraints({
            advanced: [{ focusMode: "continuous" }],
          });
        }
      } catch {
        // nicht kritisch
      }

      setModeLabel("Live-Scan aktiv");

      const scanFrame = async () => {
        if (cancelled || hasScannedRef.current) return;

        try {
          if (
            video.readyState >= 2 &&
            video.videoWidth > 0 &&
            video.videoHeight > 0
          ) {
            const ctx = canvas.getContext("2d");

            if (ctx) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;

              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

              const barcodes = await detector.detect(canvas);

              if (Array.isArray(barcodes) && barcodes.length > 0) {
                const text = barcodes[0]?.rawValue;

                if (text) {
                  await handleDetectedText(text);
                  return;
                }
              }
            }
          }
        } catch {
          // Frame-Fehler ignorieren
        }

        frameLoopRef.current = window.setTimeout(
          scanFrame,
          250
        ) as unknown as number;
      };

      scanFrame();
    }

    async function startHtml5QrCodeFallback() {
      const regionId = "qr-reader-region";
      const scanner = new Html5Qrcode(regionId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.AZTEC,
        ],
        verbose: false,
      });

      scannerRef.current = scanner;
      setModeLabel("Live-Scan Fallback aktiv");

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 12,
          qrbox: { width: 300, height: 300 },
          aspectRatio: 1.333334,
          disableFlip: false,
        },
        async (decodedText) => {
          if (cancelled || hasScannedRef.current) return;
          await handleDetectedText(decodedText);
        },
        () => {
          // ignorieren
        }
      );
    }

    async function startScanner() {
      setStarting(true);
      setError(null);
      setLastScanText("");
      setModeLabel("");

      try {
        if (
          window.location.protocol !== "https:" &&
          window.location.hostname !== "localhost" &&
          window.location.hostname !== "127.0.0.1"
        ) {
          throw new Error("Die Kamera funktioniert nur mit HTTPS oder localhost.");
        }

        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Dieses Gerät unterstützt keinen Kamera-Zugriff.");
        }

        try {
          await startNativeBarcodeDetector();
        } catch (nativeErr) {
          console.warn(
            "Native BarcodeDetector fehlgeschlagen, nutze Fallback:",
            nativeErr
          );
          await startHtml5QrCodeFallback();
        }
      } catch (err: any) {
        console.error("QR Scanner Startfehler:", err);

        if (!cancelled) {
          const rawMessage =
            err?.message ||
            err?.toString?.() ||
            "Kamera konnte nicht gestartet werden.";

          let friendlyMessage = rawMessage;

          if (/permission|denied|NotAllowedError/i.test(rawMessage)) {
            friendlyMessage =
              "Kein Kamerazugriff. Bitte Browser-Berechtigung für die Kamera erlauben.";
          } else if (
            /NotFoundError|Requested device not found/i.test(rawMessage)
          ) {
            friendlyMessage = "Es wurde keine Kamera gefunden.";
          } else if (/https|secure context/i.test(rawMessage)) {
            friendlyMessage =
              "Die Kamera funktioniert nur mit HTTPS oder auf localhost.";
          } else if (
            /NotReadableError|Could not start video source/i.test(rawMessage)
          ) {
            friendlyMessage =
              "Die Kamera wird bereits von einer anderen App oder Browser-Registerkarte verwendet.";
          }

          setError(friendlyMessage);
        }
      } finally {
        if (!cancelled) {
          setStarting(false);
        }
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      hasScannedRef.current = false;

      if (frameLoopRef.current !== null) {
        clearTimeout(frameLoopRef.current);
        frameLoopRef.current = null;
      }

      const stream = mediaStreamRef.current;
      mediaStreamRef.current = null;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        scanner
          .stop()
          .catch(() => {})
          .finally(() => {
            try {
              scanner.clear();
            } catch {}
          });
      }
    };
  }, [open, onScanSuccess]);

  async function handleImageFile(file: File) {
    setScanningImage(true);
    setError(null);

    try {
      const scanner =
        scannerRef.current ?? new Html5Qrcode("qr-reader-region");

      const decodedText = await scanner.scanFile(file, true);

      if (decodedText) {
        await handleDetectedText(decodedText);
        return;
      }

      throw new Error("Kein Code erkannt.");
    } catch (err) {
      console.error("QR Scan aus Bild fehlgeschlagen:", err);
      setError(
        "Der Code konnte aus dem Foto nicht gelesen werden. Live-Scan ist auf diesem Gerät meist zuverlässiger."
      );
    } finally {
      setScanningImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 p-3 md:p-4">
      <div className="flex h-full items-center justify-center">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="border-b border-gray-200 px-4 py-4 md:px-5">
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            <p className="mt-2 text-sm text-gray-700">
              Halte den DJI-Code möglichst groß und ruhig vor die Rückkamera.
            </p>
          </div>

          <div className="px-4 py-4 md:px-5">
            <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-black">
              <video
                ref={videoRef}
                className="h-[360px] w-full object-cover"
                autoPlay
                muted
                playsInline
              />
              <canvas ref={canvasRef} className="hidden" />
              <div id="qr-reader-region" className="hidden" />

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-64 w-64 rounded-2xl border-4 border-green-400 shadow-[0_0_0_9999px_rgba(0,0,0,0.2)]">
                  <div className="absolute -left-1 -top-1 h-8 w-8 border-l-4 border-t-4 border-white rounded-tl-lg" />
                  <div className="absolute -right-1 -top-1 h-8 w-8 border-r-4 border-t-4 border-white rounded-tr-lg" />
                  <div className="absolute -bottom-1 -left-1 h-8 w-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
                  <div className="absolute -bottom-1 -right-1 h-8 w-8 border-b-4 border-r-4 border-white rounded-br-lg" />
                </div>
              </div>
            </div>

            <div className="mt-3 text-sm text-gray-700">
              {starting ? "Kamera wird gestartet..." : modeLabel || "Scanner bereit"}
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={scanningImage}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-800 disabled:opacity-50"
              >
                {scanningImage ? "Bild wird geprüft..." : "📷 Foto als Fallback aufnehmen"}
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  handleImageFile(file);
                }
              }}
            />

            {error && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {error}
              </div>
            )}

            {lastScanText && (
              <div className="mt-3 break-all rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                Letzter Scan: {lastScanText}
              </div>
            )}

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Tipp: QR möglichst nicht schräg und ohne Spiegelung scannen.
            </div>
          </div>

          <div className="border-t border-gray-200 px-4 py-4 md:px-5">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-medium text-gray-800"
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}