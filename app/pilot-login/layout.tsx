import type { ReactNode } from "react";

// Only /pilot-login. No changes to the original page, DJI JSBridge,
// authentication, API endpoints, MQTT, or the regular app layout.
const compatibleCss = String.raw`/* DJI Pilot 2 UI compatibility layer. Only active on /pilot-login. */
.dji-view-root, .dji-view-root * { box-sizing: border-box; }
.dji-view-root { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
.dji-view-root main {
  display: block !important; width: 100% !important; max-width: 820px !important;
  margin: 0 auto !important; padding: 22px 18px 55px !important;
  color: #15283b !important; background: transparent !important;
  font: 18px/1.48 Arial, Helvetica, sans-serif !important;
}
.dji-view-root main > header,
.dji-view-root main > section,
.dji-view-root main > details {
  display: block !important; width: 100% !important; margin: 0 0 16px !important;
  padding: 22px !important; border: 1px solid #d1dce8 !important;
  border-radius: 14px !important; background: #ffffff !important;
  color: #15283b !important; box-shadow: 0 3px 12px rgba(15,37,61,0.08) !important;
}
.dji-view-root main > header { background: #143a59 !important; border-color: #143a59 !important; }
.dji-view-root main > header *, .dji-view-root main > header h1,
.dji-view-root main > header p { color: #ffffff !important; }
.dji-view-root h1, .dji-view-root h2 {
  margin: 0 0 12px !important; font-family: Arial,Helvetica,sans-serif !important;
  font-weight: 700 !important; line-height: 1.25 !important; color: #163a58 !important;
}
.dji-view-root h1 { font-size: 28px !important; }
.dji-view-root h2 { font-size: 22px !important; }
.dji-view-root h1 span { font-size: 22px !important; }
.dji-view-root p, .dji-view-root li {
  margin: 8px 0 !important; font: 17px/1.5 Arial,Helvetica,sans-serif !important;
  color: #33495c !important;
}
.dji-view-root section > div, .dji-view-root details > div { margin: 12px 0 !important; }
.dji-view-root .flex { display: flex !important; justify-content: space-between !important; align-items: center !important; gap: 12px !important; }
.dji-view-root label { display: block !important; color: #1a354c !important; margin: 16px 0 10px !important; font: 600 17px/1.4 Arial,Helvetica,sans-serif !important; }
.dji-view-root input, .dji-view-root select, .dji-view-root textarea {
  display: block !important; width: 100% !important; max-width: 100% !important;
  min-height: 54px !important; margin: 8px 0 12px !important;
  padding: 10px 13px !important; background: #ffffff !important;
  border: 1px solid #94a8bb !important; border-radius: 9px !important;
  color: #11273d !important; font: 18px Arial,Helvetica,sans-serif !important;
  -webkit-appearance: auto !important;
}
.dji-view-root button {
  display: block !important; width: 100% !important; min-height: 52px !important;
  margin: 11px 0 !important; padding: 12px 16px !important;
  background: #e8f0f7 !important; border: 1px solid #9db1c2 !important;
  border-radius: 9px !important; color: #163a58 !important;
  font: 700 17px/1.35 Arial,Helvetica,sans-serif !important;
  white-space: normal !important; cursor: pointer;
}
.dji-view-root .flex > button { flex: 0 0 auto !important; width: auto !important; min-height: 46px !important; margin: 0 !important; }
.dji-view-root button[class*="bg-emerald"], .dji-view-root button[class*="bg-slate-900"] {
  background: #167047 !important; border-color: #167047 !important; color: #ffffff !important;
}
.dji-view-root button:disabled { opacity: .50 !important; cursor: default !important; }
.dji-view-root section [role="alert"], .dji-view-root main > [role="alert"],
.dji-view-root section [class*="bg-amber"] {
  display: block !important; margin: 12px 0 !important; padding: 13px !important;
  background: #fff4d9 !important; border: 1px solid #e9d59d !important;
  border-radius: 9px !important; color: #68480b !important;
  font: 16px/1.5 Arial,Helvetica,sans-serif !important;
  overflow-wrap: break-word;
}
.dji-view-root [role="status"], .dji-view-root section [class*="bg-slate-100"] {
  display: block !important; margin: 12px 0 !important; padding: 13px !important;
  background: #eef5fa !important; border: 1px solid #cfdeea !important;
  border-radius: 9px !important; color: #25445f !important;
  font: 16px/1.5 Arial,Helvetica,sans-serif !important;
  overflow-wrap: break-word;
}
.dji-view-root summary { font: 700 17px/1.5 Arial,Helvetica,sans-serif !important; color: #143a59 !important; cursor: pointer; }
.dji-view-root a { color: #12659a !important; text-decoration: underline !important; }
.dji-view-root strong { font-weight: 700 !important; }
.dji-view-root main > p { text-align: center !important; font-size: 14px !important; }
@media (max-width: 620px) {
  .dji-view-root main { padding: 14px 10px 40px !important; }
  .dji-view-root main > header, .dji-view-root main > section, .dji-view-root main > details { padding: 16px !important; }
  .dji-view-root h1 { font-size: 25px !important; }
}
/* DJI_HEADER_CENTER_V2 */
.dji-view-root main > header,
.dji-view-root main > header h1,
.dji-view-root main > header p { text-align: center !important; }
`;

export default function DjiPilotLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <style>{compatibleCss}</style>
      <div
        className="dji-view-root"
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0, left: 0,
          zIndex: 2147483000, overflowY: "auto",
          backgroundColor: "#edf3f9", color: "#15283b",
          WebkitOverflowScrolling: "touch", fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: 18,
        }}
      >
        {children}
      </div>
    </>
  );
}
