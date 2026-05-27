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

function createScannerRegionId() {
  return `qr-reader-region-${Math.random().toString(36).slice(2)}`;
}

function isSecureCameraContext() {
  if (typeof window === "undefined") return false;

  return (
    window.location.protocol === "https:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
}

export default function QrScannerModal({
  open,
  title = "QR-Code scannen",
  onClose,
  onScanSuccess,
}: Props) {
  const scannerRegionIdRef = useRef(createScannerRegionId());
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const hasScannedRef = useRef(false);
  const startRunIdRef = useRef(0);
  const stoppingRef = useRef(false);
  const onScanSuccessRef = useRef(onScanSuccess);

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
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
      setError("Der Code wurde erkannt, konnte aber nicht verarbeitet werden.");
    }
  }

  async function loadCameras() {
    try {
      let videoDevices: CameraInfo[] = [];

      try {
        const html5Cameras = await Html5Qrcode.getCameras();

        videoDevices = html5Cameras.map((camera, index) => ({
          deviceId: camera.id,
          label: camera.label || `Kamera ${index + 1}`,
        }));
      } catch {
        if (navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();

          videoDevices = devices
            .filter((device) => device.kind === "videoinput")
            .map((device, index) => ({
              deviceId: device.deviceId,
              label: device.label || `Kamera ${index + 1}`,
            }));
        }
      }

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

  function readRunningCapabilities(scanner: Html5Qrcode | null) {
    if (!scanner) {
      setCapabilities(defaultCapabilities);
      return;
    }

    try {
      const rawCapabilities =
        (scanner as any).getRunningTrackCapabilities?.() || null;

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

      if (zoomSupported) {
        const preferredZoom = Math.min(Math.max(2, minZoom), maxZoom);
        setZoomValue(preferredZoom);

        (scanner as any)
          .applyVideoConstraints?.({
            advanced: [{ zoom: preferredZoom }],
          })
          .catch?.(() => {});
      }

      if (focusSupported) {
        (scanner as any)
          .applyVideoConstraints?.({
            advanced: [{ focusMode: "continuous" }],
          })
          .catch?.(() => {});
      }
    } catch (err) {
      console.warn("Kamera-Fähigkeiten konnten nicht gelesen werden:", err);
      setCapabilities(defaultCapabilities);
    }
  }

  async function stopScanner() {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    setRunning(false);
    setModeLabel("");
    setCapabilities(defaultCapabilities);
    setTorchEnabled(false);

    if (!scanner || stoppingRef.current) return;

    stoppingRef.current = true;

    try {
      try {
        await scanner.stop();
      } catch {
        // Scanner war eventuell noch nicht vollständig gestartet.
      }

      try {
        scanner.clear();
      } catch {
        // nicht kritisch
      }
    } finally {
      stoppingRef.current = false;
    }
  }

  async function startScanner() {
    const runId = ++startRunIdRef.current;

    setStarting(true);
    setError(null);
    setLastScanText("");
    setModeLabel("");
    setTorchEnabled(false);
    setCapabilities(defaultCapabilities);
    hasScannedRef.current = false;

    try {
      if (!isSecureCameraContext()) {
        throw new Error("Die Kamera funktioniert nur mit HTTPS oder localhost.");
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Dieses Gerät unterstützt keinen Kamera-Zugriff.");
      }

      await stopScanner();

      if (!open || runId !== startRunIdRef.current) return;

      const scanner = new Html5Qrcode(scannerRegionIdRef.current, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.AZTEC,
        ],
        verbose: false,
      });

      scannerRef.current = scanner;

      const cameraConfig: string | MediaTrackConstraints = selectedCameraId
        ? selectedCameraId
        : {
            facingMode: { ideal: "environment" },
          };

      await scanner.start(
        cameraConfig,
        {
          fps: 10,
          qrbox: { width: 260, height: 260 },
          disableFlip: false,
        },
        async (decodedText) => {
          if (runId !== startRunIdRef.current || hasScannedRef.current) return;
          await handleDetectedText(decodedText);
        },
        () => {
          // fortlaufende Fehlscans ignorieren
        }
      );

      if (runId !== startRunIdRef.current) {
        await stopScanner();
        return;
      }

      setRunning(true);
      setModeLabel("Live-Scan aktiv");

      await loadCameras();
      readRunningCapabilities(scanner);
    } catch (err: any) {
      console.error("QR Scanner Startfehler:", err);

      const rawMessage =
        err?.message ||
        err?.name ||
        err?.toString?.() ||
        "Kamera konnte nicht gestartet werden.";

      let friendlyMessage = rawMessage;

      if (/permission|denied|NotAllowedError/i.test(rawMessage)) {
        friendlyMessage =
          "Kein Kamerazugriff. Bitte Browser-Berechtigung für die Kamera erlauben.";
      } else if (/NotFoundError|Requested device not found/i.test(rawMessage)) {
        friendlyMessage = "Es wurde keine Kamera gefunden.";
      } else if (/https|secure context/i.test(rawMessage)) {
        friendlyMessage =
          "Die Kamera funktioniert nur mit HTTPS oder auf localhost.";
      } else if (
        /NotReadableError|Could not start video source|TrackStartError/i.test(
          rawMessage
        )
      ) {
        friendlyMessage =
          "Die Kamera wird bereits von einer anderen App oder Browser-Registerkarte verwendet.";
      } else if (/OverconstrainedError|constraint/i.test(rawMessage)) {
        friendlyMessage =
          "Die gewählte Kamera konnte nicht gestartet werden. Bitte eine andere Kamera auswählen oder die Seite neu laden.";
      }

      setError(friendlyMessage);
      await stopScanner();
    } finally {
      if (runId === startRunIdRef.current) {
        setStarting(false);
      }
    }
  }

  useEffect(() => {
    if (!open) {
      startRunIdRef.current += 1;
      stopScanner();
      return;
    }

    startScanner();

    return () => {
      startRunIdRef.current += 1;
      stopScanner();
    };
    // Wichtig: selectedCameraId steht hier absichtlich nicht in den Dependencies.
    // Sonst startet der Scanner direkt nach dem Laden der Kameraliste erneut
    // und bleibt auf manchen Android-Geräten schwarz.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function changeZoom(value: number) {
    const scanner = scannerRef.current;
    if (!scanner) return;

    const nextZoom = Math.min(
      Math.max(value, capabilities.minZoom),
      capabilities.maxZoom
    );

    setZoomValue(nextZoom);

    try {
      await (scanner as any).applyVideoConstraints?.({
        advanced: [{ zoom: nextZoom }],
      });
    } catch (err) {
      console.warn("Zoom konnte nicht gesetzt werden:", err);
    }
  }

  async function toggleTorch() {
    const scanner = scannerRef.current;
    if (!scanner) return;

    const nextValue = !torchEnabled;

    try {
      await (scanner as any).applyVideoConstraints?.({
        advanced: [{ torch: nextValue }],
      });

      setTorchEnabled(nextValue);
    } catch (err) {
      console.warn("Taschenlampe konnte nicht geschaltet werden:", err);
      setError("Taschenlampe wird auf diesem Gerät nicht unterstützt.");
    }
  }

  async function handleImageFile(file: File) {
    setScanningImage(true);
    setError(null);

    try {
      await stopScanner();

      const scanner = new Html5Qrcode(scannerRegionIdRef.current, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.AZTEC,
        ],
        verbose: false,
      });

      scannerRef.current = scanner;

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

      hasScannedRef.current = false;

      if (open) {
        await startScanner();
      }
    } finally {
      setScanningImage(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120] overflow-y-auto bg-black/60 p-3 md:p-4">
      <style jsx global>{`
        .qr-scanner-region {
          width: 100% !important;
          min-height: 360px !important;
          background: #000 !important;
        }

        .qr-scanner-region video,
        .qr-scanner-region canvas {
          width: 100% !important;
          min-height: 360px !important;
          object-fit: cover !important;
          background: #000 !important;
        }

        .qr-scanner-region div {
          box-sizing: border-box;
        }
      `}</style>
      <div className="flex min-h-full items-center justify-center">
        <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="border-b border-gray-200 px-4 py-4 md:px-5">
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            <p className="mt-2 text-sm text-gray-700">
              Halte den DJI-Code möglichst groß und ruhig vor die Rückkamera.
            </p>
          </div>

          <div className="px-4 py-4 md:px-5">
            <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-black">
              <div
                id={scannerRegionIdRef.current}
                className="qr-scanner-region min-h-[360px] bg-black"
              />

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
                : running
                  ? modeLabel || "Live-Scan aktiv"
                  : error
                    ? "Scanner konnte nicht gestartet werden."
                    : "Scanner bereit"}
            </div>

            {cameras.length > 0 && (
              <div className="mt-3">
                <label className="mb-1 block text-xs font-semibold text-gray-700">
                  Kamera auswählen
                </label>
                <select
                  value={selectedCameraId}
                  onChange={(e) => {
                    const nextCameraId = e.target.value;
                    setSelectedCameraId(nextCameraId);
                    window.setTimeout(() => {
                      startScanner();
                    }, 150);
                  }}
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

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => startScanner()}
                disabled={starting}
                className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-800 disabled:opacity-50"
              >
                Scanner neu starten
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={scanningImage}
                className="rounded-xl border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-800 disabled:opacity-50"
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
              Tipp M3T/M4T: Wenn der QR-Code unscharf ist, Zoom auf 2x oder 3x
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