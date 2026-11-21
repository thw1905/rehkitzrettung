import { db } from '@/lib/db';
import { checkGpsTestPin } from '@/lib/gps-test-access';
export function dateOnly(input: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) throw new Error('Ungültiges Datum');
  const d=new Date(input+'T00:00:00.000Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0,10)!==input) throw new Error('Ungültiges Datum');
  return d;
}
export function inSeason(date: Date): boolean {
  return date.getUTCMonth()>=4 && date.getUTCMonth()<=6;
}
export async function assertValidOperationDate(date:Date){
  if(inSeason(date))return;
  const existing=await db.operationDay.findUnique({where:{date},select:{isTest:true}});
  if(!existing?.isTest)throw new Error('Außerhalb Mai bis Juli sind nur PIN-freigeschaltete TEST-Einsatztage erlaubt.');
}
export async function verifyTestDayPin(pin:string):Promise<boolean>{
 // Identischer PIN wie bei GPS-Test und Demo-Auftraegen.
 // Keine eigene PIN-/Hash-Konfiguration fuer zusaetzliche Einsatztage.
 return typeof pin === 'string' && pin.length >= 4 && pin.length <= 64 && checkGpsTestPin(pin);
}
