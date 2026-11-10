// REHKITZ_DJI_V36 – automatische, aber NICHT veroeffentlichte Flugvorbereitung pro Auftrag.
import { createHash } from 'node:crypto';
import { db } from '@/lib/db';
import { optimizeTeamRoadRoute } from '@/lib/team-routes/road-routing';
import { createFlightPlan } from './planner';
import { optionsForCamera } from './coverage';
import { analyzeTerrainForPlan } from './terrain-service-v31';
import type {TerrainReportV31} from './terrain-v31';
import { droneDefaults,readTeamDrone,readOrderPreparation,saveOrderPreparation,type PreparedOrderV36 } from './team-aircraft-v36';

export async function assignmentForOrder(orderId:string){
 const order=await db.order.findUnique({where:{id:orderId},select:{id:true,fieldId:true,status:true,startTime:true,operationDayTeamId:true}});
 if(!order?.operationDayTeamId)return null;
 const team=await db.operationDayTeam.findUnique({where:{id:order.operationDayTeamId},select:{id:true,pilotId:true,operationDayId:true}});
 if(!team)return null;
 const drone=await readTeamDrone(team.id);
 return {order,team,aircraft:drone?.aircraft??null};
}
async function signatureForOrder(orderId:string){
 const order=await db.order.findUnique({where:{id:orderId},select:{id:true,fieldId:true,status:true,startTime:true,operationDayTeamId:true,field:{select:{areaGeoJson:true,updatedAt:true}}}});
 if(!order?.operationDayTeamId)return null;
 const team=await readTeamDrone(order.operationDayTeamId);
 if(!team)return null;
 const hash=createHash('sha256').update(JSON.stringify({fieldId:order.fieldId,teamId:order.operationDayTeamId,aircraft:team.aircraft,polygon:order.field.areaGeoJson,revision:36})).digest('hex');
 return {order,aircraft:team.aircraft,signature:hash};
}
export async function getOrderPreparation(orderId:string){
 const assignment=await assignmentForOrder(orderId);
 const stamp=await signatureForOrder(orderId);
 const draft=await readOrderPreparation(orderId);
 const valid=Boolean(stamp&&draft&&stamp.signature===draft.signature&&draft.operationDayTeamId===stamp.order.operationDayTeamId);
 const notStarted=assignment?.order.status==='OFFEN'&&!assignment.order.startTime;
 const stale=Boolean(stamp&&notStarted&&(!valid||!draft?.publishedMissionId||draft.publishedSignature!==stamp.signature));
 return {assignment,draft:valid?draft:null,stale,valid,signature:stamp?.signature??null};
}
export async function prepareOrder(orderId:string){
 const stamped=await signatureForOrder(orderId);
 if(!stamped)return {orderId,state:'NO_AIRCRAFT' as const};
 const {order,aircraft,signature}=stamped;
 if(order.status!=='OFFEN'||order.startTime)return {orderId,state:'IN_PROGRESS' as const};
 const old=await readOrderPreparation(orderId);
 if(old?.signature===signature)return {orderId,state:old.state};
 const p=droneDefaults(aircraft);
 const fieldPlan=await db.field.findUnique({where:{id:order.fieldId},select:{areaGeoJson:true}});
 if(!fieldPlan)return {orderId,state:'NO_FIELD' as const};
 const options=optionsForCamera(p.options,aircraft,'THERMAL',20,false);
 const plan=createFlightPlan(fieldPlan.areaGeoJson,options,null);
 if(plan.coverageComplete!==true)throw new Error('Kameraabdeckung unvollstaendig.');
 // Nachtvorbereitung: Grundroute berechnen. Fehlende DGM1-Daten blockieren nicht die anderen Auftraege.
 let terrainError:string|null=null,state:'READY'|'TERRAIN_PENDING'|'ERROR'='READY';
 let terrainReport:TerrainReportV31|null=null;
 try{terrainReport=await analyzeTerrainForPlan(plan,plan.waypoints[0],options.altitude);}
 catch(e){state='TERRAIN_PENDING';terrainError=e instanceof Error?e.message:'DGM1 nicht verfuegbar';}
 // Bei parallelen Umverteilungen niemals einen Entwurf fuer eine alte Teamzuordnung speichern.
 const fresh=await signatureForOrder(orderId);
 if(!fresh||fresh.signature!==signature||fresh.order.status!=='OFFEN')return {orderId,state:'CHANGED' as const};
 const draft:PreparedOrderV36={version:36,orderId,fieldId:order.fieldId,operationDayTeamId:order.operationDayTeamId!,aircraft,signature,state,
 options:p.options,overlapPercent:20,manualSpacing:false,terrain:p.terrain,
 estimatedMinutes:plan.estimatedMinutes,waypointCount:plan.waypoints.length,coverageComplete:true,plan,terrainReport,
 terrainError,preparedAt:Date.now(),needsPilotReview:true};
 await saveOrderPreparation(draft);
 return {orderId,state};
}
export async function prepareDay(operationDayId:string){
 const rows=await db.order.findMany({where:{operationDayId,status:'OFFEN',operationDayTeamId:{not:null}},select:{id:true},orderBy:{sortOrder:'asc'}});
 const result:{orderId:string;state:string}[]=[];
 for(const row of rows){try{result.push(await prepareOrder(row.id));}catch(e){result.push({orderId:row.id,state:e instanceof Error?e.message:'ERROR'});}}
 return {count:rows.length,prepared:result.filter(x=>x.state==='READY'||x.state==='TERRAIN_PENDING').length,details:result};
}
export async function ensureChangedOrdersPrepared(oldTeamId:string|null,newTeamId:string|null,orderId:string){
 // Loescht keine Cloud-KMZ. Ein neuer Fingerabdruck macht die alte Mission fuer diesen Auftrag ungueltig.
 const draft=await prepareOrder(orderId);
 return {oldTeamId,newTeamId,draft};
}

// Nach einer Umverteilung nur noch offene Aufträge optimieren; den ersten Auftrag je Team beibehalten.
export async function refreshTeamRoadRoute(teamId:string|null){
 if(!teamId)return {state:'NO_TEAM'};
 const team=await db.operationDayTeam.findUnique({where:{id:teamId},select:{orders:{where:{status:'OFFEN',startTime:null},select:{id:true,sortOrder:true,field:{select:{locationLatitude:true,locationLongitude:true}}}}}});
 if(!team)return {state:'NO_TEAM'};
 const sorted=[...team.orders].sort((a,b)=>a.sortOrder-b.sortOrder||a.id.localeCompare(b.id));
 const valid=sorted.filter(o=>Number.isFinite(o.field?.locationLatitude)&&Number.isFinite(o.field?.locationLongitude));
 if(valid.length<2)return {state:'UNCHANGED'};
 try{
  const optimized=await optimizeTeamRoadRoute(valid.map(o=>({id:o.id,latitude:o.field!.locationLatitude!,longitude:o.field!.locationLongitude!})));
  const others=sorted.filter(o=>!valid.some(v=>v.id===o.id)).map(o=>o.id);
  const ids=[...optimized.orderedIds,...others];
  // Vorhandene Sortierungspositionen wiederverwenden, fertige und laufende Auftraege unangetastet.
  const positions=sorted.map(o=>o.sortOrder);
  await db.$transaction(ids.map((id,i)=>db.order.update({where:{id},data:{sortOrder:positions[i]}})));
  return {state:'UPDATED',mode:optimized.mode};
 }catch(e){console.warn('[DJI-V36] Routenoptimierung nicht verfuegbar',teamId,e);return {state:'UNCHANGED'};}
}
