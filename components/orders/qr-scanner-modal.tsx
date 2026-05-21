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

type CameraInfo = {
  deviceId: string;
  label: string;
};

type CameraCapabilityState = {
  zoomSupported: boolean;
  minZoom: number;
  maxZoom: number;
  zoomStep: number;
  torchSupported: boolean;
  focusSupported: boolean;
};

const defaultCapabilities: CameraCapabilityState = {
  zoomSupported: false,
  minZoom: 1,
  maxZoom: 1,
  zoomStep: 0.1,
  torchSupported: false,
  focusSupported: false,
};

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
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const frameLoopRef = useRef<number | null>(null);
  const hasScannedRef = useRef(false);

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [scanningImage, setScanningImage] = useState(false);
  const [lastScanText, setLastScanText] = useState("");
  const [modeLabel, setModeLabel] = useState("");
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [capabilities, setCapabilities] =
    useState<CameraCapabilityState>(defaultCapabilities);
  const [zoomValue, setZoomValue] = useState(1);
  const [torchEnabled, setTorchEnabled] = useState(false);

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

  async function loadCameras() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;

      const devices = await navigator.mediaDevices.enumerateDevices();

      const videoDevices = devices
        .filter((device) => device.kind === "videoinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Kamera ${index + 1}`,
        }));

      setCameras(videoDevices);

      if (!selectedCameraId && videoDevices.length > 0) {
        const backCamera =
          videoDevices.find((camera) =>
            /back|rear|environment|rück|hinten/i.test(camera.label)
          ) || videoDevices[videoDevices.length - 1];

        setSelectedCameraId(backCamera.deviceId);
      }
    } catch (err) {
      console.warn("Kameras konnten nicht geladen werden:", err);
    }
  }

  async function applyCameraEnhancements(track: MediaStreamTrack) {
    videoTrackRef.current = track;

    try {
      const rawCapabilities = track.getCapabilities?.() as any;

      const zoomSupported = !!rawCapabilities?.zoom;
      const minZoom = zoomSupported ? rawCapabilities.zoom.min ?? 1 : 1;
      const maxZoom = zoomSupported ? rawCapabilities.zoom.max ?? 1 : 1;
      const zoomStep = zoomSupported ? rawCapabilities.zoom.step ?? 0.1 : 0.1;

      const focusSupported =
        Array.isArray(rawCapabilities?.focusMode) &&
        rawCapabilities.focusMode.includes("continuous");

      const torchSupported = !!rawCapabilities?.torch;

      setCapabilities({
        zoomSupported,
        minZoom,
        maxZoom,
        zoomStep,
        torchSupported,
        focusSupported,
      });

      const advanced: any[] = [];

      if (focusSupported) {
        advanced.push({ focusMode: "continuous" });
      }

      if (zoomSupported) {
        const preferredZoom = Math.min(Math.max(2, minZoom), maxZoom);
        setZoomValue(preferredZoom);
        advanced.push({ zoom: preferredZoom });
      }

      if (advanced.length > 0) {
        await (track as any).applyConstraints({ advanced });
      }
    } catch (err) {
      console.warn("Kamera-Optimierung nicht verfügbar:", err);
      setCapabilities(defaultCapabilities);
    }
  }

  async function changeZoom(value: number) {
    const track = videoTrackRef.current;
    if (!track) return;

    const nextZoom = Math.min(
      Math.max(value, capabilities.minZoom),
      capabilities.maxZoom
    );

    setZoomValue(nextZoom);

    try {
      await (track as any).applyConstraints({
        advanced: [{ zoom: nextZoom }],
      });
    } catch (err) {
      console.warn("Zoom konnte nicht gesetzt werden:", err);
    }
  }

  async function toggleTorch() {
    const track = videoTrackRef.current;
    if (!track) return;

    const nextValue = !torchEnabled;

    try {
      await (track as any).applyConstraints({
        advanced: [{ torch: nextValue }],
      });

      setTorchEnabled(nextValue);
    } catch (err) {
      console.warn("Taschenlampe konnte nicht geschaltet werden:", err);
      setError("Taschenlampe wird auf diesem Gerät nicht unterstützt.");
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

      const videoConstraints: MediaTrackConstraints = selectedCameraId
        ? {
            deviceId: { exact: selectedCameraId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: { ideal: "environment" },
          }
        : {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });

      mediaStreamRef.current = stream;

      await loadCameras();

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

      if (track) {
        await applyCameraEnhancements(track);
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
            const ctx = canvas.getContext("2d", { willReadFrequently: true });

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
          180
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

      const cameraConfig = selectedCameraId
        ? { deviceId: { exact: selectedCameraId } }
        : { facingMode: "environment" };

      await scanner.start(
        cameraConfig,
        {
          fps: 15,
          qrbox: { width: 260, height: 260 },
          aspectRatio: 1.333334,
          disableFlip: false,
          videoConstraints: {
            facingMode: "environment",
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          } as any,
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
  setTorchEnabled(false);
  setCapabilities(defaultCapabilities);

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
  videoTrackRef.current = null;

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
}, [open, selectedCameraId, onScanSuccess]);

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
                <div className="absolute -left-1 -top-1 h-8 w-8 rounded-tl-lg border-l-4 border-t-4 border-white" />
                <div className="absolute -right-1 -top-1 h-8 w-8 rounded-tr-lg border-r-4 border-t-4 border-white" />
                <div className="absolute -bottom-1 -left-1 h-8 w-8 rounded-bl-lg border-b-4 border-l-4 border-white" />
                <div className="absolute -bottom-1 -right-1 h-8 w-8 rounded-br-lg border-b-4 border-r-4 border-white" />
              </div>
            </div>
          </div>

          <div className="mt-3 text-sm text-gray-700">
            {starting ? "Kamera wird gestartet..." : modeLabel || "Scanner bereit"}
          </div>

          {cameras.length > 1 && (
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-gray-700">
                Kamera auswählen
              </label>
              <select
                value={selectedCameraId}
                onChange={(e) => setSelectedCameraId(e.target.value)}
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
              >
                {cameras.map((camera) => (
                  <option key={camera.deviceId} value={camera.deviceId}>
                    {camera.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {capabilities.zoomSupported && (
            <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-3">
                <label className="text-xs font-semibold text-gray-700">
                  Zoom
                </label>
                <span className="text-xs font-semibold text-gray-700">
                  {zoomValue.toFixed(1)}x
                </span>
              </div>

              <input
                type="range"
                min={capabilities.minZoom}
                max={capabilities.maxZoom}
                step={capabilities.zoomStep}
                value={zoomValue}
                onChange={(e) => changeZoom(Number(e.target.value))}
                className="mt-2 w-full"
              />

              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => changeZoom(1)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800"
                >
                  1x
                </button>

                <button
                  type="button"
                  onClick={() => changeZoom(2)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800"
                >
                  2x
                </button>

                <button
                  type="button"
                  onClick={() => changeZoom(3)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-semibold text-gray-800"
                >
                  3x
                </button>
              </div>
            </div>
          )}

          {capabilities.torchSupported && (
            <div className="mt-3">
              <button
                type="button"
                onClick={toggleTorch}
                className="w-full rounded-xl border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm font-semibold text-yellow-900"
              >
                {torchEnabled ? "🔦 Taschenlampe ausschalten" : "🔦 Taschenlampe einschalten"}
              </button>
            </div>
          )}

          {capabilities.focusSupported && (
            <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-xs text-green-900">
              Autofokus wurde angefordert.
            </div>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={scanningImage}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-800 disabled:opacity-50"
            >
              {scanningImage
                ? "Bild wird geprüft..."
                : "📷 Foto als Fallback aufnehmen"}
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
            Tipp M3T: Wenn der QR-Code unscharf ist, Zoom auf 2x oder 3x
            stellen und das Handy etwas weiter weg halten. Nicht zu nah an
            den Controller gehen.
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