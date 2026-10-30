import type { Metadata } from "next";
import PilotLoginClient from "@/components/dji/PilotLoginClient";

export const metadata: Metadata = { title: "DJI-Technik – Rehkitzrettung Hegering Hittfeld", robots: { index: false, follow: false } };
export default function PilotTechnicalPage() { return <PilotLoginClient />; }
