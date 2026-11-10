// REHKITZ_DJI_V36 – gleiche gerätespezifische Standardwerte für Browser und Server.
import type { MissionOptions } from './planner';
import type { TerrainSettingsV31 } from './terrain-v31';
export type DroneV36='M3T'|'M4T';
export function droneDefaults(aircraft:DroneV36):{options:MissionOptions;overlapPercent:number;manualSpacing:boolean;terrain:TerrainSettingsV31}{
 const altitude=aircraft==='M3T'?50:70;
 const speed=aircraft==='M3T'?4:6;
 return {options:{altitude,speed,spacing:25,direction:0,margin:0,autoDirection:true,autoStartAtFirst:true,smoothTurns:aircraft==='M4T'},overlapPercent:20,manualSpacing:false,terrain:{startPoint:null,altitudeMode:'terrain',rthHeight:100}};
}
