import type { Metadata } from "next";
import PilotLoginClient from "@/components/dji/PilotLoginClient";

export const metadata: Metadata = {
  title: "DJI Pilot 2 – Rehkitzrettung",
  robots: { index: false, follow: false },
};

/**
 * Entry point for DJI Pilot 2 -> Cloud Service -> Open Platforms.
 * Stage 2A: login, select order and validate DJI JSBridge/license.
 * Does NOT enable an MQTT connection or map element auto-import.
 */
export default function PilotLoginPage() {
  return <PilotLoginClient />;
}
