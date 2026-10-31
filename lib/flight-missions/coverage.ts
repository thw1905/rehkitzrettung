// REHKITZ_FLUGMISSION_V1 – DJI-Flugplanung; keine Aenderung bestehender DJI-Bindings.
// Geometrische Kameraabdeckung bei senkrechtem Blick (Gimbal -90 Grad), ohne Zoom.
// DJI: M3T Thermal DFOV 61°, M4T Thermal DFOV 45°; RGB Wide M3T FOV 84°, M4T FOV 82°.
// RGB-FOV wird naeherungsweise als diagonaler Winkel interpretiert. Keine Garantie fuer Wild-Erkennung.
import type { MissionOptions } from "./planner";
export type AircraftModel = "M3T" | "M4T";
export type MissionCamera = "THERMAL" | "RGB_WIDE";
const profiles = {
  M3T: { THERMAL: { label: "Wärmebild 640×512", diagonalDeg: 61, width: 640, height: 512 }, RGB_WIDE: { label: "RGB-Weitwinkel", diagonalDeg: 84, width: 4, height: 3 } },
  M4T: { THERMAL: { label: "Wärmebild 640×512", diagonalDeg: 45, width: 640, height: 512 }, RGB_WIDE: { label: "RGB-Weitwinkel", diagonalDeg: 82, width: 4, height: 3 } },
} as const;
export type Coverage = { label: string; diagonalDeg: number; horizontalDeg: number; theoreticalWidthM: number; suggestedSpacingM: number; overlapPercent: number };
export function cameraCoverage(aircraft: AircraftModel, camera: MissionCamera, altitude: number, overlapPercent: number): Coverage {
 if (aircraft !== "M3T" && aircraft !== "M4T") throw new Error("Unbekannte DJI-Drohne.");
 if (camera !== "THERMAL" && camera !== "RGB_WIDE") throw new Error("Unbekannte Kamera.");
 if (!Number.isFinite(altitude) || altitude < 10 || altitude > 120) throw new Error("Flughöhe muss zwischen 10 und 120 m liegen.");
 if (!Number.isFinite(overlapPercent) || overlapPercent < 10 || overlapPercent > 70) throw new Error("Seitliche Überlappung muss 10 bis 70 % betragen.");
 const profile=profiles[aircraft][camera];
 const halfDiagonal=Math.tan(profile.diagonalDeg*Math.PI/360);
 const horizontalHalf=halfDiagonal * profile.width / Math.hypot(profile.width,profile.height);
 const horizontalDeg=2*Math.atan(horizontalHalf)*180/Math.PI;
 const theoreticalWidthM=2*altitude*horizontalHalf;
 const suggestedSpacingM=Math.round(theoreticalWidthM*(1-overlapPercent/100)*10)/10;
 return {label:profile.label,diagonalDeg:profile.diagonalDeg,horizontalDeg,theoreticalWidthM,suggestedSpacingM,overlapPercent};
}
export function optionsForCamera(o: MissionOptions, aircraft: AircraftModel, camera: MissionCamera, overlapPercent: number, manualSpacing: boolean): MissionOptions {
 const coverage=cameraCoverage(aircraft,camera,o.altitude,overlapPercent);
 if(typeof manualSpacing!=="boolean")throw new Error("Manueller Bahnabstand muss eindeutig gewählt sein.");
 return {...o,spacing:manualSpacing?o.spacing:coverage.suggestedSpacingM};
}
