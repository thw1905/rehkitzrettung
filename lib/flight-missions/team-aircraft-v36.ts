// REHKITZ_DJI_V36 – teamgebundenes Drohnenprofil; separate Planung, keine KMZ-Veroeffentlichung.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import type { MissionOptions,FlightPlan } from './planner';
import type {TerrainReportV31} from './terrain-v31';
import type { TerrainSettingsV31 } from './terrain-v31';
import type { DroneV36 } from './profiles-v36';
export { droneDefaults } from './profiles-v36';

const idPattern = /^[a-zA-Z0-9_-]{8,128}$/;
const dir = () => path.join(process.env.DJI_WAYLINE_STORAGE_DIR || path.join(process.cwd(), '.data', 'dji-waylines'), '.vorbereitung-v36');
function safeId(id:string) { if(!idPattern.test(id)) throw new Error('Unzulaessige ID.'); return id; }
async function readJson<T>(file:string):Promise<T|null>{
 try{return JSON.parse(await fs.readFile(file,'utf8')) as T;}
 catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}
}
async function atomicJson(file:string,data:unknown){
 await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
 const temp=file+'.'+randomUUID()+'.tmp';
 await fs.writeFile(temp,JSON.stringify(data,null,2),{mode:0o600,flag:'wx'});
 try{await fs.rename(temp,file);}catch(e){await fs.rm(temp,{force:true});throw e;}
}
export type TeamDroneRecord = {operationDayTeamId:string; operationDayId:string; aircraft:DroneV36; changedAt:number; changedBy:string};
export async function readTeamDrone(teamId:string):Promise<TeamDroneRecord|null>{return readJson<TeamDroneRecord>(path.join(dir(),'team-'+safeId(teamId)+'.json'));}
export async function writeTeamDrone(teamId:string,aircraft:DroneV36,userId:string){
 if(aircraft!=='M3T'&&aircraft!=='M4T')throw new Error('Nur DJI M3T oder M4T.');
 const team=await db.operationDayTeam.findUnique({where:{id:teamId},select:{id:true,operationDayId:true}});
 if(!team)throw new Error('Tages-Team nicht gefunden.');
 const record:TeamDroneRecord={operationDayTeamId:team.id,operationDayId:team.operationDayId,aircraft,changedAt:Date.now(),changedBy:userId};
 await atomicJson(path.join(dir(),'team-'+safeId(team.id)+'.json'),record);
 return record;
}
export type PreparedOrderV36 = {
 version:36;orderId:string;fieldId:string;operationDayTeamId:string;aircraft:DroneV36;
 signature:string;state:'READY'|'TERRAIN_PENDING'|'ERROR';
 options:MissionOptions;overlapPercent:20;manualSpacing:false;terrain:TerrainSettingsV31;
 estimatedMinutes:number|null;waypointCount:number;coverageComplete:boolean;plan:FlightPlan;terrainReport:TerrainReportV31|null;
 terrainError:string|null;preparedAt:number;needsPilotReview:true;
 publishedMissionId?:string;publishedSignature?:string;
};
export async function readOrderPreparation(orderId:string){return readJson<PreparedOrderV36>(path.join(dir(),'order-'+safeId(orderId)+'.json'));}
export async function saveOrderPreparation(p:PreparedOrderV36){await atomicJson(path.join(dir(),'order-'+safeId(p.orderId)+'.json'),p);}
export async function savePublishedPreparation(orderId:string,missionId:string,signature:string){
 const old=await readOrderPreparation(orderId);if(!old||old.signature!==signature)return;
 await saveOrderPreparation({...old,publishedMissionId:missionId,publishedSignature:signature});
}
