import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createAccount, login, requireAccount, checkPassword, hashPassword, requireSameOrigin } from "../lib/accounts";
import { query } from "../lib/account-db";
import { withAccount, auditedFetch } from "../lib/call-audit";
import { importBilling, parseBillingCsv, costToNano, nanoToCost } from "../lib/billing-import";
import { GET as overview } from "../app/api/admin/overview/route";
import { GET as users, PATCH as changeUser } from "../app/api/admin/users/route";
import { GET as media } from "../app/api/account/media/route";

let admin:any, member:any, other:any;
const origin="http://localhost:3001";
const password="test-password-123456";
const nativeFetch=globalThis.fetch;
function request(route:string,account:any,body?:unknown) {
  return new Request(origin+route,{method:body===undefined?"GET":"POST",headers:{origin,cookie:account?`pinwu_session=${account.token}`:"","content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
}
before(async()=>{
  delete process.env.DATABASE_URL;delete process.env.POSTGRES_URL;delete process.env.VERCEL;delete process.env.PINWU_PRIVATE_BLOB_TOKEN;delete process.env.PINWU_APP_ORIGIN;
  process.env.PINWU_LOCAL_DATA_DIR=await mkdtemp(path.join(tmpdir(),"pinwu-accounts-test-"));
  await createAccount("admin-test","测试管理员",password,"admin");
  await createAccount("member-test","测试员工",password);
  await createAccount("other-test","另一员工",password);
  admin=await login("admin-test",password,"admin-ip");member=await login("member-test",password,"member-ip");other=await login("other-test",password,"other-ip");
});
after(()=>{globalThis.fetch=nativeFetch;});

test("password hashing, invalid credentials and server-side roles",async()=>{
  const hash=hashPassword(password);assert.notEqual(hash,password);assert(checkPassword(password,hash));assert(!checkPassword("wrong",hash));
  await assert.rejects(login("member-test","wrong","different-ip"),/用户名或密码/);
  assert.equal((await requireAccount(request("/",member))).id,member.user.id);
  assert.equal((await users(request("/api/admin/users",member))).status,403);
  assert.equal((await users(request("/api/admin/users",null))).status,401);
  const body=await (await users(request("/api/admin/users",admin))).json();assert.equal(body.users.length,3);assert(!JSON.stringify(body).includes("password_hash"));
});
test("origin protection and unauthenticated generation never reach provider",async()=>{
  assert.throws(()=>requireSameOrigin(new Request(origin+"/api/generate",{method:"POST",headers:{origin:"https://evil.test"}})),/来源/);
  let called=false;const handler=withAccount(async()=>{called=true;return Response.json({ok:true});});
  assert.equal((await handler(request("/api/generate",null,{}))).status,401);assert.equal(called,false);
});
let callId="",requestId=randomUUID();
test("real route wrapper records metadata but never archives generated images",async()=>{
  let agent="";
  globalThis.fetch=async(_input,init)=>{agent=new Headers(init?.headers).get("User-Agent")||"";return Response.json({ok:true},{headers:{"x-request-id":requestId}});};
  const handler=withAccount(async()=>{
    await auditedFetch("https://task-api-1.65535.space/v1/images/generations",{method:"POST",body:JSON.stringify({model:"image-test",prompt:"一台机器人"})});
    return Response.json({imageBase64:"data:image/png;base64,iVBORw0KGgo="});
  });
  const response=await handler(request("/api/generate",member,{}));assert.equal(response.status,200);
  assert.equal((await response.json()).imageBase64,"data:image/png;base64,iVBORw0KGgo=");
  const [call]=await query("SELECT * FROM account_calls WHERE request_id=$1",[requestId]);callId=call.id;
  assert.equal(call.user_id,member.user.id);assert.equal(call.model,"image-test");assert.equal(call.status,"succeeded");assert.equal(agent,`Pinwu/1.0 call/${call.id}`);
  assert.equal(call.media_id,null);assert.equal(call.storage_error,null);
  assert.equal((await query("SELECT * FROM account_media")).length,0);
  assert.equal((await media(request("/api/account/media?id=missing",member))).status,404);
  assert.equal((await media(request("/api/account/media?id=missing",null))).status,401);
  globalThis.fetch=nativeFetch;
});
function csv(id:string,model:string,ua:string,cost="0.000060") {return `time,request_id,model,user_agent,cost_usd,status\n2026-11-03T03:40:00Z,${id},${model},${ua},${cost},200\n`;}
test("CSV preview, exact cost precision, repeat import and conflicting import rollback",async()=>{
  assert.equal(nanoToCost(costToNano("0.000060")),"0.000060000");assert.throws(()=>costToNano("-1"));
  const file=csv(requestId,"image-test",`Pinwu/1.0 call/${callId}`);
  const preview=await importBilling(file,"test.csv",admin.user.id,false);assert.equal(preview.matched,1);
  assert.equal((await query("SELECT * FROM account_bills")).length,0);
  const saved=await importBilling(file,"test.csv",admin.user.id,true);assert.equal(saved.addedCost,"0.000060000");
  const repeat=await importBilling(file,"test.csv",admin.user.id,true);assert.equal(repeat.added,0);assert.equal(repeat.duplicates,1);
  const combined=csv(randomUUID(),"unknown","external").trim()+"\n"+csv(requestId,"image-test",`Pinwu/1.0 call/${callId}`,"9").split("\n")[1]+"\n";
  await assert.rejects(importBilling(combined,"conflict.csv",admin.user.id,true),/不一致/);
  assert.equal((await query("SELECT * FROM account_bills")).length,1);
  const body=await (await overview(request("/api/admin/overview",admin))).json();assert.equal(body.totals.cost,"0.000060000");assert.equal(body.byUser[0].id,member.user.id);
});
test("unmatched and wrong-model bills never assigned to arbitrary employees",async()=>{
  const result=await importBilling(csv(randomUUID(),"wrong-model",`Pinwu/1.0 call/${callId}`),"unmatched.csv",admin.user.id,true);assert.equal(result.unmatched,1);
  const body=await (await overview(request("/api/admin/overview",admin))).json();assert.equal(body.unmatched.count,1);assert.equal(body.totals.cost,"0.000060000");
});
test("async task ownership persists and unauthorized users cannot poll it",async()=>{
  globalThis.fetch=async()=>Response.json({id:"job-test"},{headers:{"x-request-id":randomUUID()}});
  const start=withAccount(async()=>{await auditedFetch("https://task-api-1.65535.space/v1/images/generations",{method:"POST",body:JSON.stringify({model:"image-test"})});return Response.json({jobId:"job-test"});});
  await start(request("/api/generate",member,{}));let polled=false;
  const poll=withAccount(async()=>{polled=true;return Response.json({status:"succeeded",imageBase64:"data:image/png;base64,iVBORw0KGgo="});});
  assert.equal((await poll(request("/api/generate/status",other,{jobId:"job-test"}))).status,403);assert.equal(polled,false);
  assert.equal((await poll(request("/api/generate/status",member,{jobId:"job-test"}))).status,200);assert(polled);
  globalThis.fetch=nativeFetch;
});
test("stream responses stay streaming while call completion is recorded",async()=>{
  const id=randomUUID();globalThis.fetch=async()=>new Response('data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n',{headers:{"x-request-id":id,"content-type":"text/event-stream"}});
  const handler=withAccount(async()=>auditedFetch("https://api2.65535.space/v1/chat/completions",{method:"POST",body:JSON.stringify({model:"text-test",stream:true,messages:[{role:"user",content:"hello"}]})}));
  const response=await handler(request("/api/free-chat",member,{}));assert.match(await response.text(),/你好/);
  const [call]=await query("SELECT * FROM account_calls WHERE request_id=$1",[id]);assert.equal(call.status,"succeeded");assert.equal(call.user_id,member.user.id);
  globalThis.fetch=nativeFetch;
});
test("password reset and disabling revoke old sessions immediately",async()=>{
  const req=request("/api/admin/users",admin,{id:other.user.id,password:"new-password-123456"});
  assert.equal((await changeUser(req)).status,200);
  await assert.rejects(requireAccount(request("/",other)),/登录/);
  const updated=await login("other-test","new-password-123456","third-ip");
  assert.equal((await changeUser(request("/api/admin/users",admin,{id:other.user.id,active:false}))).status,200);
  await assert.rejects(requireAccount(request("/",updated)),/登录/);
  assert.equal((await changeUser(request("/api/admin/users",admin,{id:admin.user.id,active:false}))).status,400);
});
test("CSV accepts actual image IDs and microsecond timestamps",()=>{
  const file=csv("img_a1b2c3d4","image-test","external").replace("2026-11-03T03:40:00Z","2026-11-03T03:41:33.167299Z");
  const [row]=parseBillingCsv(file);assert.equal(row.requestId,"img_a1b2c3d4");assert.equal(row.time,"2026-11-03T03:41:33.167Z");
});
async function seedCall(model:string,requestId:string|null=null) {
  const id=randomUUID();await query("INSERT INTO account_calls(id,user_id,task_id,feature,provider,model,endpoint,user_agent,request_id,prompt,status,started_at) VALUES($1,$2,$3,'测试','65535',$4,'https://api2.65535.space/v1/chat/completions',$5,$6,'test','succeeded',$7)",[id,member.user.id,randomUUID(),model,`Pinwu/1.0 call/${id}`,requestId,new Date().toISOString()]);return id;
}
test("UA fallback is exact and preview handles duplicate attribution consistently",async()=>{
  const id=await seedCall("ua-model");const ua=`Pinwu/1.0 call/${id}`;
  const first=csv(randomUUID(),"ua-model",ua);const second=csv(randomUUID(),"ua-model",ua).split("\n")[1];
  const input=first+second+"\n";
  const preview=await importBilling(input,"ua.csv",admin.user.id,false);assert.equal(preview.matched,1);assert.equal(preview.unmatched,1);
  const commit=await importBilling(input,"ua.csv",admin.user.id,true);assert.equal(commit.matched,preview.matched);assert.equal(commit.unmatched,preview.unmatched);
});
test("unmatched records can be relinked without billing twice",async()=>{
  const requestId=randomUUID();const input=csv(requestId,"late-model","external");
  assert.equal((await importBilling(input,"late.csv",admin.user.id,true)).unmatched,1);
  const id=await seedCall("late-model",requestId);
  const relink=await importBilling(input,"late.csv",admin.user.id,true);assert.equal(relink.added,0);assert.equal(relink.relinked,1);
  const [bill]=await query("SELECT call_id FROM account_bills WHERE request_id=$1",[requestId]);assert.equal(bill.call_id,id);
});
test("supplier model aliases require an explicit matching requested_model",async()=>{
  const id=await seedCall("requested-alias");
  const input=`time,request_id,model,requested_model,user_agent,cost_usd,status\n2026-11-03T03:40:00Z,${randomUUID()},billed-model,requested-alias,Pinwu/1.0 call/${id},0.012,200\n`;
  assert.equal((await importBilling(input,"alias.csv",admin.user.id,false)).matched,1);
});
test("stale tabs cannot attribute a previous employee's actions to a new login",async()=>{
  const req=request("/api/generate",admin,{});req.headers.set("X-Pinwu-Account",member.user.id);
  const route=withAccount(async()=>{throw new Error("must not run");});assert.equal((await route(req)).status,401);
});
test("original supplier CSV files remain import-compatible when locally available",async(t)=>{
  const files=["/Users/keyon/Downloads/request-logs-2026-11-03033553.csv","/Users/keyon/Downloads/request-logs-2026-11-03034137.csv"];
  for(const file of files){
    let text:string;try{text=await readFile(file,"utf8");}catch{t.skip("Local private CSV not available in this checkout");return;}
    assert(parseBillingCsv(text).length>0);
  }
});
