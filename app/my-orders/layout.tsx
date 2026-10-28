// DJI_BATTERY_PLACEMENT_V8_1: Akkuempfehlung ausschliesslich auf der Seite Meine Auftraege.
import type { ReactNode } from "react";
import DjiGlobalBatteryRecommendation from "@/components/dji/DjiGlobalBatteryRecommendation";

export default function MyOrdersBatteryLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="mx-auto w-full max-w-5xl px-4 pt-4">
        <DjiGlobalBatteryRecommendation />
      </div>
      {children}
    </>
  );
}
