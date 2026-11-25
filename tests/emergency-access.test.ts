import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { emergencyLogin, emergencyUser, emergencyMode } from "../lib/emergency-access";
import { withAccount, auditedFetch } from "../lib/call-audit";
import { GET as me } from "../app/api/auth/me/route";
import { POST as login } from "../app/api/auth/login/route";
import { POST as logout } from "../app/api/auth/logout/route";
import { POST as register } from "../app/api/auth/register/route";
import { GET as users } from "../app/api/admin/users/route";
import { GET as overview } from "../app/api/admin/overview/route";
import { GET as media } from "../app/api/account/media/route";
import { POST as chat } from "../app/api/free-chat/route";
import { getAccount } from "../lib/accounts";
const origin="https://example.test";
const code="test-only-random-access-code";
const originalFetch=globalThis.fetch;
before(()=>{
  process.env.PINWU_ACCOUNT_MODE="emergency";
  process.env.PINWU_EMERGENCY_SECRET="test-secret-never-used-in-production";
  process.env.PINWU_EMERGENCY_CODE_HASH=createHash("sha256").update(code).digest("hex");
  // Any accidental DB access must fail: emergency paths must never initialize it.
  process.env.DATABASE_URL="postgresql://invalid:invalid@127.0.0.1:1/unavailable?connect_timeout=1";
});
after(()=>{globalThis.fetch=originalFetch;});
function req(route:string,token="",body?:unknown,receipts="") {
  return new Request(origin+route,{method:body===undefined?"GET":"POST",headers:{origin,cookie:`pinwu_session=${token}; ${receipts}`,"content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
}
test("signed emergency sessions reject tampering and wrong codes without DB",async()=>{
  assert(emergencyMode());assert.equal(emergencyLogin("wrong",""),null);
  const entry=emergencyLogin(code,"")!;assert(entry.user.id.startsWith("temporary-"));
  assert.equal(emergencyUser(entry.token)?.id,entry.user.id);
  assert.equal(emergencyUser(entry.token+"tamper"),null);
  assert.equal(emergencyUser("0".repeat(64)),null);
  const response=await login(req("/api/auth/login","",{username:"",password:code}));
  assert.equal(response.status,200);assert.match(response.headers.get("set-cookie")!,/HttpOnly/i);
  assert.equal((await (await me(req("/api/auth/me",entry.token))).json()).user.id,entry.user.id);
  assert.equal((await logout(req("/api/auth/logout",entry.token,{}))).status,200);
  assert.equal((await (await me(req("/api/auth/me"))).json()).emergency,true);
});
test("account administration, registration and legacy media stay closed",async()=>{
  const token=emergencyLogin(code,"")!.token;
  assert.equal((await users(req("/api/admin/users",token))).status,503);
  assert.equal((await overview(req("/api/admin/overview",token))).status,503);
  assert.equal((await media(req("/api/account/media?id=old",token))).status,503);
  assert.equal((await register(req("/api/auth/register",token,{username:"test",displayName:"test",password:"12345678"}))).status,503);
});
test("protected generation runs with no audit DB access; strangers and foreign origins denied",async()=>{
  let invoked=0;globalThis.fetch=async()=>Response.json({ok:true});
  const handler=withAccount(async()=>{invoked++;await auditedFetch("https://api2.65535.space/v1/chat/completions",{method:"POST"});return Response.json({text:"ok"});});
  assert.equal((await handler(req("/api/research-chat","",{}))).status,401);
  const token=emergencyLogin(code,"")!.token;
  assert.equal((await handler(req("/api/research-chat",token,{}))).status,200);
  const foreign=new Request(origin+"/api/research-chat",{method:"POST",headers:{origin:"https://evil.test",cookie:`pinwu_session=${token}`}});
  assert.equal((await handler(foreign)).status,403);assert.equal(invoked,1);
});
test("async task receipts survive instances and reject other sessions and job IDs",async()=>{
  const a=emergencyLogin(code,"")!,b=emergencyLogin(code,"")!;
  for(const [startPath,statusPath,key] of [["/api/generate","/api/generate/status","jobId"],["/api/upscale","/api/upscale/status","taskId"],["/api/video/generate","/api/video/status","taskId"],["/api/tripo/generate","/api/tripo/status","taskId"],["/api/tripo/convert","/api/tripo/status","taskId"]]) {
    const response=await withAccount(async()=>Response.json({[key]:"task-123"},{status:202}))(req(startPath,a.token,{}));
    const receipt=response.headers.get("set-cookie")!.split(";")[0];
    const poll=withAccount(async()=>Response.json({status:"done",imageBase64:"image"}));
    assert.equal((await poll(req(statusPath,a.token,{[key]:"task-123"},receipt))).status,200,startPath);
    assert.equal((await poll(req(statusPath,b.token,{[key]:"task-123"},receipt))).status,403);
    assert.equal((await poll(req(statusPath,a.token,{[key]:"task-other"},receipt))).status,403);
    assert.equal((await poll(req(statusPath,a.token,{[key]:"task-123"}))).status,403);
  }
});
test("switch off immediately rejects emergency credentials",async()=>{
  const token=emergencyLogin(code,"")!.token;
  process.env.PINWU_ACCOUNT_MODE="accounts";assert.equal(emergencyMode(),false);
  assert.equal(await getAccount(req("/api/auth/me",token)),null);
  process.env.PINWU_ACCOUNT_MODE="emergency";
});
test("free chat falls back when supplier denies a model, without database access",async()=>{
  process.env.PERDESIGN_CHAT_API_KEY="test-provider-key";
  const models:string[]=[];
  globalThis.fetch=async(_url,init)=>{
    const model=JSON.parse(String(init?.body)).model;models.push(model);
    if(model==="gpt-5.5")return Response.json({error:{message:'group "OpenAi - Pro" not authorized for model gpt-5.5'}},{status:403});
    return new Response('data: {"choices":[{"delta":{"content":"OK"},"finish_reason":null}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',{headers:{"Content-Type":"text/event-stream"}});
  };
  const response=await chat(req("/api/free-chat",emergencyLogin(code,"")!.token,{apiKey:"server-managed",baseUrl:"https://api2.65535.space/v1",model:"gpt-5.5",conversation:[{role:"user",content:"只回复OK"}]}));
  const body=await response.text();assert.match(body,/"content":"OK"/);assert.match(body,/"type":"done"/);assert.deepEqual(models,["gpt-5.5","gpt-6-astra"]);
  globalThis.fetch=originalFetch;
});
