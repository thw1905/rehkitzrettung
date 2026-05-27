"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  onScanSuccess: (decodedText: string) => void | Promise<void>;
};

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

function getFriendlyCameraError(error: any) {
  const rawMessage =
    error?.message || error?.name || error?.toString?.() || "Unbekannter Fehler";

  if (/permission|denied|NotAllowedError/i.test(rawMessage)) {
    return "Kein Kamerazugriff. Bitte in Chrome die Kamera-Berechtigung für diese Seite erlauben.";
  }

  if (/NotFoundError|Requested device not found|not found/i.test(rawMessage)) {
    return "Es wurde keine Kamera gefunden.";
  }

  if (/OverconstrainedError|constraint/i.test(rawMessage)) {
    return "Die gewählte Kamera-Einstellung wird vom Handy nicht unterstützt. Bitte eine andere Kamera auswählen oder die Seite neu laden.";
  }

  if (/https|secure context/i.test(rawMessage)) {
    return "Die Kamera funktioniert nur über HTTPS.";
  }

  if (/NotReadableError|Could not start video source|TrackStartError|in use/i.test(rawMessage)) {
    return "Die Kamera konnte nicht gestartet werden. Sie wird eventuell von einer anderen App oder einem anderen Browser-Tab verwendet.";
  }

  return `Scanner konnte nicht gestartet werden: ${rawMessage}`;
}

function pickBackCamera(cameras: CameraInfo[]) {
  if (cameras.length === 0) return "";

  return (
    cameras.find((camera) =>
      /back|rear|environment|rück|hinten|0, facing back/i.test(camera.label)
    ) || cameras[cameras.length - 1]
  ).deviceId;
}

export default function QrScannerModal({
  open,
  title = "QR-Code scannen",
  onClose,
  onScanSuccess,
}: Props) {
  const readerIdRef = useRef(
    `qr-reader-region-${Math.random().toString(36).slice(2)}`
  );

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const hasScannedRef = useRef(false);
  const startingRef = useRef(false);
  const mountedRef = useRef(false);
  const onScanSuccessRef = useRef(onScanSuccess);

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

  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess;
  }, [onScanSuccess]);

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
      await onScanSuccessRef.current(decodedText);
    } catch (err) {
      console.error("Scan-Erfolg konnte nicht verarbeitet werden:", err);
      hasScannedRef.current = false;
    }
  }

  async function stopScanner() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    videoTrackRef.current = null;
    setTorchEnabled(false);
    setCapabilities(defaultCapabilities);

    if (!scanner) return;

    try {
      await scanner.stop();
    } catch {
      // Scanner war eventuell noch nicht gestartet.
    }

    try {
      scanner.clear();
    } catch {
      // nicht kritisch
    }
  }

  async function loadCamerasViaHtml5Qrcode() {
    try {
      const devices = await Html5Qrcode.getCameras();

      const videoDevices: CameraInfo[] = (devices || []).map((device, index) => ({
        deviceId: device.id,
        label: device.label || `Kamera ${index + 1}`,
      }));

      setCameras(videoDevices);

      return videoDevices;
    } catch (err) {
      console.warn("Kameras konnten nicht geladen werden:", err);
      return [];
    }
  }

  async function applyCameraEnhancementsFromVideoElement() {
    try {
      const readerElement = document.getElementById(readerIdRef.current);
      const video = readerElement?.querySelector("video") as HTMLVideoElement | null;
      const stream = video?.srcObject as MediaStream | null;
      const track = stream?.getVideoTracks?.()[0] || null;

      if (!track) {
        setCapabilities(defaultCapabilities);
        return;
      }

      videoTrackRef.current = track;

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

  async function startScanner(preferredCameraId?: string) {
    if (!open || startingRef.current) return;

    startingRef.current = true;
    setStarting(true);
    setError(null);
    setLastScanText("");
    setModeLabel("");
    setTorchEnabled(false);
    setCapabilities(defaultCapabilities);
    hasScannedRef.current = false;

    try {
      if (
        window.location.protocol !== "https:" &&
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1"
      ) {
        throw new Error("Die Kamera funktioniert nur mit HTTPS.");
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Dieses Gerät unterstützt keinen Kamera-Zugriff.");
      }

      await stopScanner();

      /*
        Wichtig:
        Erst die Kameras laden, dann Html5Qrcode direkt mit der deviceId starten.
        Die vorherige Variante mit constraints/deviceId exact erzeugt auf manchen
        Android-Geräten ein schwarzes Bild oder OverconstrainedError.
      */
      const availableCameras = await loadCamerasViaHtml5Qrcode();

      const cameraId =
        preferredCameraId ||
        selectedCameraId ||
        pickBackCamera(availableCameras);

      if (!cameraId) {
        throw new Error("Keine Kamera verfügbar.");
      }

      setSelectedCameraId(cameraId);

      const scanner = new Html5Qrcode(readerIdRef.current, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.AZTEC,
        ],
        verbose: false,
      });

      scannerRef.current = scanner;

      await scanner.start(
        cameraId,
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const size = Math.max(220, Math.floor(minEdge * 0.72));

            return {
              width: size,
              height: size,
            };
          },
          disableFlip: false,
        },
        async (decodedText) => {
          await handleDetectedText(decodedText);
        },
        () => {
          // Scan-Fehlschläge pro Frame ignorieren.
        }
      );

      setModeLabel("Live-Scan aktiv");

      // Nach dem Start kurz warten, damit html5-qrcode das Video einhängen kann.
      window.setTimeout(() => {
        applyCameraEnhancementsFromVideoElement();
      }, 400);
    } catch (err: any) {
      console.error("QR Scanner Startfehler:", err);
      await stopScanner();

      setError(getFriendlyCameraError(err));
      setModeLabel("");
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }

  async function restartWithCamera(cameraId: string) {
    setSelectedCameraId(cameraId);
    await startScanner(cameraId);
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
    mountedRef.current = true;

    if (!open) return;

    // Warten bis das Modal und der Reader-Div wirklich im DOM gerendert sind.
    const timer = window.setTimeout(() => {
      if (mountedRef.current) {
        startScanner();
      }
    }, 350);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(timer);
      hasScannedRef.current = false;
      stopScanner();
    };
    // selectedCameraId absichtlich nicht als Dependency:
    // Kamerawechsel wird manuell über restartWithCamera ausgelöst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function handleImageFile(file: File) {
    setScanningImage(true);
    setError(null);

    try {
      const tempScanner =
        scannerRef.current ?? new Html5Qrcode(readerIdRef.current);

      const decodedText = await tempScanner.scanFile(file, true);

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

  const readerId = readerIdRef.current;

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 p-3 md:p-4">
      <style jsx global>{`
        #${readerId} {
          width: 100% !important;
          min-height: 360px !important;
          background: #000 !important;
        }

        #${readerId} video {
          width: 100% !important;
          height: 360px !important;
          object-fit: cover !important;
          display: block !important;
          background: #000 !important;
        }

        #${readerId} canvas {
          display: none !important;
        }

        #${readerId} > div {
          border: 0 !important;
        }

        #${readerId}__dashboard_section {
          display: none !important;
        }
      `}</style>

      <div className="flex h-full items-center justify-center">
        <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-2xl">
          <div className="border-b border-gray-200 px-4 py-4 md:px-5">
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            <p className="mt-2 text-sm text-gray-700">
              Halte den DJI-Code möglichst groß und ruhig vor die Rückkamera.
            </p>
          </div>

          <div className="px-4 py-4 md:px-5">
            <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-black">
              <div id={readerId} className="bg-black" />

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
              {starting
                ? "Kamera wird gestartet..."
                : modeLabel || "Scanner bereit"}
            </div>

            {cameras.length > 0 && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold text-gray-700">
                  Kamera auswählen
                </label>
                <select
                  value={selectedCameraId}
                  onChange={(e) => restartWithCamera(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                >
                  {cameras.map((camera) => (
                    <option key={camera.deviceId} value={camera.deviceId}>
                      {camera.label}
                    </option>
                  ))}
                </select>

                {cameras.length === 1 && (
                  <div className="mt-2 text-xs text-gray-500">
                    Es wurde nur eine Kamera erkannt.
                  </div>
                )}
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
                  {torchEnabled
                    ? "🔦 Taschenlampe ausschalten"
                    : "🔦 Taschenlampe einschalten"}
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
              Tipp: Wenn der QR-Code unscharf ist, Zoom auf 2x oder 3x stellen
              und das Handy etwas weiter weg halten. Nicht zu nah an den
              Controller gehen.
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