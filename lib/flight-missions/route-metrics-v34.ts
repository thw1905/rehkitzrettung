// REHKITZ_DJI_FLUGPLANUNG_V3_4 – Flugzeit-Schaetzung inklusive Anflug, Rueckweg und Wenden.
// Keine DJI-Akku- oder Echtzeitprognose. Vertikale Starts/Landungen sind nicht enthalten.
import type {FlightPlan,LonLat} from "./planner";
export type RouteMetricsV34={
 searchM:number; transfersM:number; approachM:number; returnM:number; totalM:number;
 turnCount:number; flightMinutes:number; cruiseMinutes:number; turnMinutes:number;
};
export function distanceM(a:LonLat,b:LonLat){
 const lat=(a[1]+b[1])*Math.PI/360;
 return Math.hypot((b[0]-a[0])*111320*Math.cos(lat),(b[1]-a[1])*111132);
}
export function routeMetrics(plan:FlightPlan,start:LonLat|null|undefined,speed:number):RouteMetricsV34 {
 const approachM=start&&plan.waypoints.length?distanceM(start,plan.waypoints[0]):0;
 const returnM=start&&plan.waypoints.length?distanceM(plan.waypoints[plan.waypoints.length-1],start):0;
 const searchM=plan.searchMeters,transfersM=Math.max(0,plan.totalMeters-searchM);
 const totalM=plan.totalMeters+approachM+returnM;
 const turnCount=Math.max(0,plan.lines.length-1);
 // Annahme für Vorausschau: durchschnittlich 3 s Verzoegerung je Bahnwechsel.
 // Keine Simulation des Flugreglers oder des Windes.
 const turnMinutes=turnCount*3/60;
 const cruiseMinutes=totalM/Math.max(0.1,speed)/60;
 return {searchM,transfersM,approachM,returnM,totalM,turnCount,
   cruiseMinutes,turnMinutes,flightMinutes:cruiseMinutes+turnMinutes};
}
