// REHKITZ_DJI_TERRAIN_V3_1
// REHKITZ_DJI_M4T_ELLIPSOID_FIX_V3_0_4
// REHKITZ_DJI_M4T_ELLIPSOID_IMPORT_FIX_V1_9
// REHKITZ_DJI_M4T_GLOBAL_HEIGHT_FIX_V1_7
// REHKITZ_DJI_M4T_PAYLOAD_FIX_V1_6
// REHKITZ_WAYLINE_CLOUD_V1 - M4T und Pilot2-Cloud-Routenbibliothek.
// REHKITZ_FLUGMISSION_V1 – DJI-Flugplanung; keine Aenderung bestehender DJI-Bindings.
import JSZip from "jszip";
import type { FlightPlan, MissionOptions } from "./planner";
export type MissionHeightsV31 = { waypointHeights?:number[]; rthHeight?:number; };
// WPML-Export V1: zunaechst nur M3T mit offiziell dokumentierten Produktcodes.
// M4T: testweise WPML 1.0.6, Geraetecode 99/1, Payload 89/2 (mit Pilot2 abgleichen).
const XML='http://www.opengis.net/kml/2.2';
const WPML='http://www.dji.com/wpmz/1.0.2';
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const num=(n:number)=>Number(n.toFixed(8)).toString();
const headerFor=(aircraft:"M3T"|"M4T")=>`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="${XML}" xmlns:wpml="${aircraft==="M4T"?"http://www.dji.com/wpmz/1.0.6":WPML}"><Document>`;
const closing='</Document></kml>';
const common=(o:MissionOptions,aircraft:"M3T"|"M4T",h?:MissionHeightsV31)=>`<wpml:missionConfig>
  <wpml:flyToWaylineMode>safely</wpml:flyToWaylineMode>
  <wpml:finishAction>goHome</wpml:finishAction>
  <wpml:exitOnRCLost>executeLostAction</wpml:exitOnRCLost>
  <wpml:executeRCLostAction>goBack</wpml:executeRCLostAction>
  <wpml:takeOffSecurityHeight>${num(Math.max(20,h?.waypointHeights?.[0]??o.altitude))}</wpml:takeOffSecurityHeight>
  <wpml:globalTransitionalSpeed>${num(o.speed)}</wpml:globalTransitionalSpeed>
  <wpml:globalRTHHeight>${num(h?.rthHeight??Math.min(120,Math.max(o.altitude+20,50)))}</wpml:globalRTHHeight>
  <wpml:droneInfo><wpml:droneEnumValue>${aircraft==="M4T"?99:77}</wpml:droneEnumValue><wpml:droneSubEnumValue>1</wpml:droneSubEnumValue></wpml:droneInfo>
  <wpml:payloadInfo><wpml:payloadEnumValue>${aircraft==="M4T"?89:67}</wpml:payloadEnumValue>${aircraft==="M4T"?"<wpml:payloadSubEnumValue>0</wpml:payloadSubEnumValue>":""}<wpml:payloadPositionIndex>0</wpml:payloadPositionIndex></wpml:payloadInfo>
</wpml:missionConfig>`;
const coords=(p:[number,number])=>`${num(p[0])},${num(p[1])}`;
// Small, bounded turn damping; only internal points can be rounded.
// Curves may shorten the strictly straight coverage at a strip end.
const horizontalDistance=(a:[number,number],b:[number,number])=>{
 const lat=(a[1]+b[1])*Math.PI/360;
 return Math.hypot((a[0]-b[0])*111320*Math.cos(lat),(a[1]-b[1])*111132);
};
function turnTags(points:[number,number][],i:number,o:MissionOptions,aircraft:"M3T"|"M4T"){
 const enabled=aircraft==="M4T"&&o.smoothTurns===true && i>0 && i<points.length-1;
 const damping=enabled?Math.min(2.5,.15*horizontalDistance(points[i-1],points[i]),.15*horizontalDistance(points[i],points[i+1])):0;
 if(damping<.25)return `<wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:waypointTurnMode><wpml:waypointTurnDampingDist>0</wpml:waypointTurnDampingDist></wpml:waypointTurnParam><wpml:useStraightLine>1</wpml:useStraightLine>`;
 return `<wpml:waypointTurnParam><wpml:waypointTurnMode>toPointAndPassWithContinuityCurvature</wpml:waypointTurnMode><wpml:waypointTurnDampingDist>${num(damping)}</wpml:waypointTurnDampingDist></wpml:waypointTurnParam><wpml:useStraightLine>1</wpml:useStraightLine>`;
}
const templatePoint=(p:[number,number],i:number,points:[number,number][],o:MissionOptions,aircraft:"M3T"|"M4T",h?:MissionHeightsV31)=>`<Placemark>
 <Point><coordinates>${coords(p)}</coordinates></Point>
 <wpml:index>${i}</wpml:index><wpml:useGlobalHeight>${aircraft==="M4T"?1:0}</wpml:useGlobalHeight><wpml:height>${num(h?.waypointHeights?.[i]??o.altitude)}</wpml:height>
 <wpml:useGlobalSpeed>1</wpml:useGlobalSpeed><wpml:useGlobalHeadingParam>1</wpml:useGlobalHeadingParam><wpml:useGlobalTurnParam>${aircraft==="M4T"&&o.smoothTurns===true?0:1}</wpml:useGlobalTurnParam>${aircraft==="M4T"&&o.smoothTurns===true?turnTags(points,i,o,aircraft):""}
</Placemark>`;
const gimbalNadirAction=`<wpml:actionGroup><wpml:actionGroupId>900</wpml:actionGroupId><wpml:actionGroupStartIndex>0</wpml:actionGroupStartIndex><wpml:actionGroupEndIndex>0</wpml:actionGroupEndIndex><wpml:actionGroupMode>sequence</wpml:actionGroupMode><wpml:actionTrigger><wpml:actionTriggerType>reachPoint</wpml:actionTriggerType></wpml:actionTrigger><wpml:action><wpml:actionId>0</wpml:actionId><wpml:actionActuatorFunc>gimbalRotate</wpml:actionActuatorFunc><wpml:actionActuatorFuncParam><wpml:gimbalHeadingYawBase>aircraft</wpml:gimbalHeadingYawBase><wpml:gimbalRotateMode>absoluteAngle</wpml:gimbalRotateMode><wpml:gimbalPitchRotateEnable>1</wpml:gimbalPitchRotateEnable><wpml:gimbalPitchRotateAngle>-90</wpml:gimbalPitchRotateAngle><wpml:gimbalRollRotateEnable>0</wpml:gimbalRollRotateEnable><wpml:gimbalYawRotateEnable>0</wpml:gimbalYawRotateEnable><wpml:gimbalRotateTimeEnable>0</wpml:gimbalRotateTimeEnable><wpml:payloadPositionIndex>0</wpml:payloadPositionIndex></wpml:actionActuatorFuncParam></wpml:action></wpml:actionGroup>`;
const executablePoint=(p:[number,number],i:number,points:[number,number][],o:MissionOptions,aircraft:"M3T"|"M4T",h?:MissionHeightsV31)=>`<Placemark>
 <Point><coordinates>${coords(p)}</coordinates></Point>
 <wpml:index>${i}</wpml:index><wpml:executeHeight>${num(h?.waypointHeights?.[i]??o.altitude)}</wpml:executeHeight><wpml:waypointSpeed>${num(o.speed)}</wpml:waypointSpeed>${aircraft==="M4T"?`<wpml:waypointGimbalHeadingParam><wpml:waypointGimbalPitchAngle>-90</wpml:waypointGimbalPitchAngle><wpml:waypointGimbalYawAngle>0</wpml:waypointGimbalYawAngle></wpml:waypointGimbalHeadingParam>${i===0?gimbalNadirAction:""}`:""}
 <wpml:waypointHeadingParam><wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode></wpml:waypointHeadingParam>
 ${turnTags(points,i,o,aircraft)}
</Placemark>`;
export async function makeMissionKmz(plan:FlightPlan,o:MissionOptions,label:string,aircraft:"M3T"|"M4T"="M3T",heights?:MissionHeightsV31):Promise<Uint8Array>{
 if(plan.waypoints.length<2||plan.waypoints.length>900) throw new Error("Ungültige Anzahl Wegpunkte.");
 if(heights?.waypointHeights && (heights.waypointHeights.length!==plan.waypoints.length || heights.waypointHeights.some(h=>!Number.isFinite(h)||h<10||h>120))) throw new Error("Ungueltiges Hoehenprofil fuer KMZ.");
 if(heights?.rthHeight!==undefined && (!Number.isFinite(heights.rthHeight)||heights.rthHeight<20||heights.rthHeight>150))throw new Error("Rueckkehrhoehe ungueltig.");
 const stamp=Date.now();
 const template=headerFor(aircraft)+`<wpml:author>Rehkitzrettung Hegering Hittfeld</wpml:author><wpml:createTime>${stamp}</wpml:createTime><wpml:updateTime>${stamp}</wpml:updateTime><name>${esc(label)}</name>`+common(o,aircraft,heights)+`<Folder>
 <wpml:templateType>waypoint</wpml:templateType><wpml:templateId>0</wpml:templateId>
 <wpml:waylineCoordinateSysParam><wpml:coordinateMode>WGS84</wpml:coordinateMode><wpml:heightMode>relativeToStartPoint</wpml:heightMode><wpml:positioningType>GPS</wpml:positioningType></wpml:waylineCoordinateSysParam>
 <wpml:autoFlightSpeed>${num(o.speed)}</wpml:autoFlightSpeed>${aircraft==="M4T"?`<wpml:globalHeight>${num(o.altitude)}</wpml:globalHeight><wpml:gimbalPitchMode>manual</wpml:gimbalPitchMode>`:""}
 <wpml:globalWaypointHeadingParam><wpml:waypointHeadingMode>followWayline</wpml:waypointHeadingMode></wpml:globalWaypointHeadingParam>
 <wpml:globalWaypointTurnMode>toPointAndStopWithDiscontinuityCurvature</wpml:globalWaypointTurnMode><wpml:globalUseStraightLine>1</wpml:globalUseStraightLine>
 ${plan.waypoints.map((p,i)=>templatePoint(p,i,plan.waypoints,o,aircraft,heights)).join('\n')}</Folder>`+closing;
 const waylines=headerFor(aircraft)+common(o,aircraft,heights)+`<Folder><wpml:templateId>0</wpml:templateId><wpml:executeHeightMode>relativeToStartPoint</wpml:executeHeightMode><wpml:waylineId>0</wpml:waylineId><wpml:autoFlightSpeed>${num(o.speed)}</wpml:autoFlightSpeed>
 ${plan.waypoints.map((p,i)=>executablePoint(p,i,plan.waypoints,o,aircraft,heights)).join('\n')}</Folder>`+closing;
 const zip=new JSZip();zip.file('wpmz/template.kml',template);zip.file('wpmz/waylines.wpml',waylines);
 return zip.generateAsync({type:'uint8array',compression:'DEFLATE',compressionOptions:{level:6}});
}
