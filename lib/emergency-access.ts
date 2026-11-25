import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { EMERGENCY_ACCESS_ENABLED, EMERGENCY_ACCESS_CODE_HASH } from "./emergency-config";

export const emergencyMode = () => process.env.PINWU_ACCOUNT_MODE
  ? process.env.PINWU_ACCOUNT_MODE === "emergency" : EMERGENCY_ACCESS_ENABLED;
const digest = (s:string) => createHash("sha256").update(s).digest("hex");
function secret() {
  const key=process.env.PINWU_EMERGENCY_SECRET || process.env.PERDESIGN_PROVIDER_API_KEY || process.env.PERDESIGN_CHAT_API_KEY || process.env.PERDESIGN_IMAGE_API_KEY;
  if(!key)throw new Error("临时访问服务尚未配置。");
  return createHmac("sha256",key).update("pinwu-emergency-access-v1").digest();
}
function sign(value:unknown) {
  const body=Buffer.from(JSON.stringify(value)).toString("base64url");
  return body+"."+createHmac("sha256",secret()).update(body).digest("base64url");
}
function verify(token:string):any {
  if(token.length>6000)return null;
  const [body,signature,extra]=token.split(".");
  if(!body||!signature||extra)return null;
  const expected=createHmac("sha256",secret()).update(body).digest("base64url");
  if(signature.length!==expected.length||!timingSafeEqual(Buffer.from(signature),Buffer.from(expected)))return null;
  try {const value=JSON.parse(Buffer.from(body,"base64url").toString());return value.exp>Date.now()?value:null;} catch {return null;}
}
export function emergencyUser(token:string) {
  const value=verify(token);
  return value?.kind==="session" && typeof value.id==="string" && value.id.startsWith("temporary-")
    ? {id:value.id,username:"temporary",displayName:"临时工作区",role:"member" as const}:null;
}
export function emergencyLogin(code:string,previousToken:string) {
  const expected=process.env.PINWU_EMERGENCY_CODE_HASH || EMERGENCY_ACCESS_CODE_HASH;
  if(!/^[a-f0-9]{64}$/.test(expected)||code.length>128||!timingSafeEqual(Buffer.from(digest(code)),Buffer.from(expected)))return null;
  const id=emergencyUser(previousToken)?.id || `temporary-${randomUUID()}`;
  const token=sign({kind:"session",id,exp:Date.now()+7*86400000});
  return {token,user:emergencyUser(token)!};
}
function cookie(request:Request,name:string) {
  return request.headers.get("cookie")?.split(";").map(s=>s.trim()).find(s=>s.startsWith(name+"="))?.slice(name.length+1)||"";
}
const receiptName=(resource:string)=>"pinwu_task_"+digest(resource).slice(0,24);
export function ownsEmergencyResource(request:Request,userId:string,resource:string) {
  const value=verify(cookie(request,receiptName(resource)));
  return value?.kind==="resource"&&value.userId===userId&&value.resource===resource;
}
export function attachEmergencyResource(response:Response,request:Request,userId:string,resource:string) {
  const value=sign({kind:"resource",userId,resource,exp:Date.now()+7*86400000});
  response.headers.append("Set-Cookie",`${receiptName(resource)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${new URL(request.url).protocol==="https:"?"; Secure":""}`);
}
