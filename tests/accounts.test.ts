import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createAccount, login, requireAccount, checkPassword, hashPassword, hashToken, requireSameOrigin } from "../lib/accounts";
import { query, initializeAccountSchema } from "../lib/account-db";
import { withAccount, auditedFetch } from "../lib/call-audit";
import { importBilling, parseBillingCsv, costToNano, nanoToCost } from "../lib/billing-import";
import { GET as overview } from "../app/api/admin/overview/route";
import { GET as users, POST as addUser, PATCH as changeUser } from "../app/api/admin/users/route";
import { GET as media } from "../app/api/account/media/route";
import { POST as register } from "../app/api/auth/register/route";
import { GET as me } from "../app/api/auth/me/route";

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
  const files=["/Users/keyon/Downloads/request-logs-2026-11-03033553.csv","/Users/keyon/Downloads/request-logs-2026-11-03034137.csv","/Users/keyon/Downloads/request-logs-2026-11-04072208.csv"];
  for(const file of files){
    let text:string;try{text=await readFile(file,"utf8");}catch{t.skip("Local private CSV not available in this checkout");return;}
    assert(parseBillingCsv(text).length>0);
  }
});

test("blank supplier fees stay unknown, known zero is billed, and overlapping exports only add new records",async()=>{
  const id=randomUUID(),zeroId=randomUUID();
  const call=await seedCall("blank-fee",id),zeroCall=await seedCall("blank-fee",zeroId);
  const blank=csv(id,"blank-fee",`Pinwu/1.0 call/${call}`,"").replace(",,200",",,502");
  const zero=csv(zeroId,"blank-fee",`Pinwu/1.0 call/${zeroCall}`,"0");
  const file=blank+zero.split("\n")[1]+"\n";
  const preview=await importBilling(file,"blank.csv",admin.user.id,false);
  assert.equal(preview.missingCost,1);assert.equal(preview.matched,2);assert.equal(preview.added,2);
  assert.equal((await query("SELECT * FROM account_bills WHERE request_id=$1",[id])).length,0);
  const saved=await importBilling(file,"blank.csv",admin.user.id,true);assert.equal(saved.addedCost,"0.000000000");
  assert.equal((await query("SELECT * FROM account_bills WHERE request_id=$1",[id]))[0].cost_nano,null);
  let body=await (await overview(request("/api/admin/overview?model=blank-fee",admin))).json();
  assert.equal(body.totals.calls,2);assert.equal(body.totals.billed,1);assert.equal(body.totals.missing_cost,1);assert.equal(body.totals.missing_bill,0);
  assert.equal(body.calls.find((c:any)=>c.id===call).cost,null);assert.equal(body.calls.find((c:any)=>c.id===call).bill_request_id,id);
  const repeat=await importBilling(file,"repeat.csv",admin.user.id,true);assert.equal(repeat.added,0);assert.equal(repeat.duplicates,2);assert.equal(repeat.updatedCosts,0);
  const newId=randomUUID();const next=file+csv(newId,"blank-fee","external","0.25").split("\n")[1]+"\n";
  const overlap=await importBilling(next,"next-day.csv",admin.user.id,true);assert.equal(overlap.added,1);assert.equal(overlap.duplicates,2);assert.equal(overlap.addedCost,"0.250000000");
  const filled=csv(id,"blank-fee",`Pinwu/1.0 call/${call}`,"0.012");
  const fillPreview=await importBilling(filled,"filled.csv",admin.user.id,false);assert.equal(fillPreview.updatedCosts,1);assert.equal(fillPreview.addedCost,"0.012000000");
  assert.equal((await query("SELECT cost_nano FROM account_bills WHERE request_id=$1",[id]))[0].cost_nano,null);
  const fill=await importBilling(filled,"filled.csv",admin.user.id,true);assert.equal(fill.added,0);assert.equal(fill.updatedCosts,1);
  await importBilling(blank,"old-export.csv",admin.user.id,true);
  body=await (await overview(request("/api/admin/overview?model=blank-fee",admin))).json();assert.equal(body.totals.billed,2);assert.equal(body.totals.missing_cost,0);assert.equal(body.totals.cost,"0.012000000");
  const bill=(await query("SELECT * FROM account_bills WHERE request_id=$1",[id]))[0];assert.equal(bill.cost_nano,12000000);assert.equal(bill.status,"200");
  assert.equal((await importBilling(filled,"repeat-filled.csv",admin.user.id,true)).updatedCosts,0);
  await assert.rejects(importBilling(csv(id,"blank-fee",`Pinwu/1.0 call/${call}`,"1"),"conflict.csv",admin.user.id,true),/不一致/);
});

test("invalid nonempty fees identify the CSV record; unmatched empty fees remain visible",async()=>{
  for(const amount of ["-1","bad","1e-7","0.0000000001"]){assert.throws(()=>parseBillingCsv(csv(randomUUID(),"model","external",amount)),/第 2 条 CSV 记录.*cost_usd/);}
  const id=randomUUID();const input=csv(id,"external-empty","external","   ");
  const parsed=parseBillingCsv(input);assert.equal(parsed[0].costNano,null);
  const saved=await importBilling(input,"empty.csv",admin.user.id,true);assert.equal(saved.unmatched,1);assert.equal(saved.missingCost,1);assert.equal(saved.unmatchedExamples[0].cost,null);
  const body=await (await overview(request("/api/admin/overview",admin))).json();assert.equal(body.unmatchedRows.find((r:any)=>r.request_id===id).cost,null);assert(Number(body.unmatched.missing_cost)>=1);
});

test("legacy billing migration preserves costs, links and unique constraints and is repeatable",async()=>{
  const moduleName="node:sqlite";const {DatabaseSync}=await import(moduleName);const db=new DatabaseSync(":memory:");
  try {
    const q=async(sql:string)=>db.prepare(sql).all();
    await initializeAccountSchema(q,false);
    db.exec("DROP TABLE account_bills; CREATE TABLE account_bills (request_id TEXT PRIMARY KEY,call_id TEXT UNIQUE REFERENCES account_calls(id),model TEXT NOT NULL,user_agent TEXT NOT NULL,billed_at TEXT NOT NULL,cost_nano BIGINT NOT NULL,status TEXT NOT NULL,imported_at TEXT NOT NULL,import_id TEXT NOT NULL); INSERT INTO account_bills VALUES('legacy-bill',NULL,'model','external','time',123456789,'200','time','import'); BEGIN IMMEDIATE;");
    await initializeAccountSchema(q,false);db.exec("COMMIT");
    const row=db.prepare("SELECT * FROM account_bills").get();assert.equal(row.request_id,"legacy-bill");assert.equal(row.cost_nano,123456789);assert.equal(row.import_id,"import");
    db.exec("INSERT INTO account_bills VALUES('unknown-bill',NULL,'model','external','time',NULL,'502','time','import')");
    assert.throws(()=>db.exec("INSERT INTO account_bills SELECT * FROM account_bills WHERE request_id='legacy-bill'"),/UNIQUE/);
    await initializeAccountSchema(q,false);assert.equal(db.prepare("SELECT COUNT(*) n FROM account_bills").get().n,2);
    assert.equal(db.prepare("SELECT cost_nano FROM account_bills WHERE request_id='unknown-bill'").get().cost_nano,null);
    assert.equal(db.prepare("PRAGMA foreign_key_list(account_bills)").all()[0].table,"account_calls");
  } finally {db.close();}
});

test("the reported 608-row export imports fully and a second import adds nothing",async(t)=>{
  let text:string;
  try{text=await readFile("/Users/keyon/Downloads/request-logs-2026-11-04072208.csv","utf8");}catch{t.skip("Private regression CSV is not installed");return;}
  const records=parseBillingCsv(text);assert.equal(records.length,608);assert.equal(records.filter(r=>r.costNano===null).length,1);
  const prior=(await query("SELECT COUNT(*) n FROM account_bills"))[0].n;
  const result=await importBilling(text,"regression.csv",admin.user.id,true);assert.equal(result.added,608);assert.equal(result.missingCost,1);
  assert.equal((await query("SELECT COUNT(*) n FROM account_bills"))[0].n,prior+608);
  const replay=await importBilling(text,"next-day-overlap.csv",admin.user.id,true);assert.equal(replay.added,0);assert.equal(replay.duplicates,608);assert.equal(replay.addedCost,"0.000000000");
  assert.equal((await query("SELECT COUNT(*) n FROM account_bills"))[0].n,prior+608);
});

function retryBill(id:string,success:boolean,cost="0.180000") {
  return csv(id,"retry-image","external",success?cost:"")
    .replace("2026-11-03T03:40:00Z",success?"2026-11-11T06:19:52Z":"2026-11-11T06:19:16Z")
    .replace(",,200",",,502");
}
test("failed and successful duplicate IDs resolve in either row order without double charging",async()=>{
  for(const successFirst of [true,false]) {
    const id=randomUUID(),success=retryBill(id,true),failed=retryBill(id,false);
    const input=successFirst?success+failed.split("\n")[1]+"\n":failed+success.split("\n")[1]+"\n";
    const preview=await importBilling(input,"retry.csv",admin.user.id,false);
    assert.equal(preview.rows,2);assert.equal(preview.added,1);assert.equal(preview.duplicates,1);
    assert.equal(preview.missingCost,0);assert.equal(preview.addedCost,"0.180000000");
    assert.equal((await query("SELECT * FROM account_bills WHERE request_id=$1",[id])).length,0);
    const saved=await importBilling(input,"retry.csv",admin.user.id,true);assert.equal(saved.added,1);
    const bill=(await query("SELECT * FROM account_bills WHERE request_id=$1",[id]))[0];
    assert.equal(bill.cost_nano,180000000);assert.equal(bill.status,"200");assert.equal(bill.billed_at,"2026-11-11T06:19:52.000Z");
    const replay=await importBilling(input,"retry-again.csv",admin.user.id,true);
    assert.equal(replay.added,0);assert.equal(replay.duplicates,2);assert.equal(replay.updatedCosts,0);assert.equal(replay.addedCost,"0.000000000");
    const old=await importBilling(failed,"older-failure.csv",admin.user.id,true);assert.equal(old.updatedCosts,0);
    assert.deepEqual((await query("SELECT * FROM account_bills WHERE request_id=$1",[id]))[0],bill);
  }
});
test("a previously imported failure is backfilled with successful retry time and fee, including zero",async()=>{
  for(const amount of ["0.180000","0"]) {
    const id=randomUUID(),failed=retryBill(id,false),success=retryBill(id,true,amount);
    await importBilling(failed,"failed.csv",admin.user.id,true);
    const preview=await importBilling(success,"success.csv",admin.user.id,false);assert.equal(preview.updatedCosts,1);
    assert.equal((await query("SELECT cost_nano FROM account_bills WHERE request_id=$1",[id]))[0].cost_nano,null);
    const filled=await importBilling(success,"success.csv",admin.user.id,true);
    assert.equal(filled.added,0);assert.equal(filled.updatedCosts,1);assert.equal(filled.addedCost,nanoToCost(costToNano(amount)));
    const bill=(await query("SELECT * FROM account_bills WHERE request_id=$1",[id]))[0];
    assert.equal(bill.cost_nano,costToNano(amount));assert.equal(bill.billed_at,"2026-11-11T06:19:52.000Z");assert.equal(bill.status,"200");
    await importBilling(failed,"old-failure.csv",admin.user.id,true);
    assert.deepEqual((await query("SELECT * FROM account_bills WHERE request_id=$1",[id]))[0],bill);
  }
});
test("retry reconciliation still rejects identity, fee and ambiguous time or status conflicts atomically",async()=>{
  const id=randomUUID(),failed=retryBill(id,false),success=retryBill(id,true);
  const conflicts=[
    success.replace("retry-image","other-model"),
    success.replace("external","other-source"),
    success.replace("06:19:52","06:18:00"),
    success.replace(",200",",502"),
  ];
  for(const conflict of conflicts) assert.throws(()=>parseBillingCsv(failed+conflict.split("\n")[1]+"\n"),/不同内容/);
  await importBilling(success,"success.csv",admin.user.id,true);
  const before=(await query("SELECT COUNT(*) n FROM account_bills"))[0].n;
  for(const conflict of [...conflicts,retryBill(id,true,"0.19")]) {
    if(conflict===success) continue;
    const combined=retryBill(randomUUID(),true)+conflict.split("\n")[1]+"\n";
    await assert.rejects(importBilling(combined,"conflict.csv",admin.user.id,true),/不一致/);
    assert.equal((await query("SELECT COUNT(*) n FROM account_bills"))[0].n,before);
  }
  assert.throws(()=>parseBillingCsv(success+retryBill(id,true,"0.19").split("\n")[1]+"\n"),/不同内容/);
});
test("November 17 retry export imports and replays without duplicate charges",async(t)=>{
  const file=process.env.PINWU_BILLING_REGRESSION_CSV;
  if(!file){t.skip("Private CSV regression is opt-in");return;}
  const text=await readFile(file,"utf8"),records=parseBillingCsv(text);
  assert.equal(records.length,3329);assert.equal(new Set(records.map(r=>r.requestId)).size,3326);
  const first=await importBilling(text,"nov17.csv",admin.user.id,true);
  const before=await query("SELECT COUNT(*) n, SUM(cost_nano) cost FROM account_bills");
  const repeat=await importBilling(text,"nov17-repeat.csv",admin.user.id,true);
  assert.equal(first.rows,3329);assert.equal(repeat.added,0);assert.equal(repeat.duplicates,3329);
  assert.equal(repeat.updatedCosts,0);assert.equal(repeat.addedCost,"0.000000000");
  assert.deepEqual(await query("SELECT COUNT(*) n, SUM(cost_nano) cost FROM account_bills"),before);
});

test("creating and resetting accounts accepts 8 characters and rejects shorter or oversized passwords",async()=>{
  for(const value of ["short77","x".repeat(129)]) {
    const response=await addUser(request("/api/admin/users",admin,{username:"eight-test",displayName:"密码长度测试",password:value}));
    assert.equal(response.status,400);
    assert.match((await response.json()).error,/8–128/);
  }
  assert.equal((await addUser(request("/api/admin/users",admin,{username:"eight-test",displayName:"密码长度测试",password:"eight888"}))).status,200);
  const original=await login("eight-test","eight888","eight-test-ip");
  for(const value of ["short77","x".repeat(129)]) {
    assert.equal((await changeUser(request("/api/admin/users",admin,{id:original.user.id,password:value}))).status,400);
    assert.equal((await requireAccount(request("/",original))).id,original.user.id);
  }
  assert.equal((await changeUser(request("/api/admin/users",admin,{id:original.user.id,password:"reset888"}))).status,200);
  await assert.rejects(requireAccount(request("/",original)),/登录/);
  assert.equal((await login("eight-test","reset888","eight-test-ip")).user.id,original.user.id);
});

function registration(username:string,extras:Record<string,unknown>={}) {
  const req=request("/api/auth/register",null,{username,displayName:"常用昵称",password:"eight888",...extras});
  req.headers.set("x-forwarded-for",`test-${username}`);return req;
}
test("public registration requires approval and cannot choose its own permissions",async()=>{
  assert.equal((await register(registration("injected",{role:"admin",active:1,approval_status:"approved"}))).status,400);
  const response=await register(registration("New-Applicant"));assert.equal(response.status,201);assert.equal(response.headers.get("set-cookie"),null);
  const [person]=await query("SELECT * FROM account_users WHERE username='new-applicant'");
  assert.equal(person.role,"member");assert.equal(person.active,0);assert.equal(person.approval_status,"pending");assert.notEqual(person.password_hash,"eight888");
  await assert.rejects(login("new-applicant","eight888","applicant-ip"),/等待管理员批准/);
  await assert.rejects(login("new-applicant","wrong","applicant-ip"),/用户名或密码/);
  assert.equal((await register(registration("NEW-APPLICANT"))).status,409);
  assert.equal((await changeUser(request("/api/admin/users",member,{id:person.id,approval:"approve"}))).status,403);
  assert.equal((await changeUser(request("/api/admin/users",null,{id:person.id,approval:"approve"}))).status,401);
  assert.equal((await changeUser(request("/api/admin/users",admin,{id:person.id,active:true}))).status,400);
  // Even a stale/forged stored session cannot grant a pending applicant access.
  const token="a".repeat(64);
  await query("INSERT INTO account_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)",[hashToken(token),person.id,new Date(Date.now()+60000).toISOString()]);
  let invoked=false;const guarded=withAccount(async()=>{invoked=true;return Response.json({ok:true});});
  assert.equal((await guarded(request("/api/generate",{token},{}))).status,401);assert.equal(invoked,false);
  assert.equal((await changeUser(request("/api/admin/users",admin,{id:person.id,approval:"approve"}))).status,200);
  assert.equal((await query("SELECT * FROM account_sessions WHERE user_id=$1",[person.id])).length,0);
  assert.equal((await changeUser(request("/api/admin/users",admin,{id:person.id,approval:"approve"}))).status,409);
  const approved=await login("new-applicant","eight888","applicant-ip");assert.equal(approved.user.role,"member");
  assert.equal((await guarded(request("/api/generate",approved,{}))).status,200);assert(invoked);
  const note="内部备注：设计二组 / 张三";
  assert.equal((await changeUser(request("/api/admin/users",admin,{id:person.id,note}))).status,200);
  const list=await (await users(request("/api/admin/users",admin))).json();assert.equal(list.users.find((u:any)=>u.id===person.id).admin_note,note);
  assert(!JSON.stringify(await (await me(request("/api/auth/me",approved))).json()).includes(note));assert(!JSON.stringify(approved.user).includes("admin_note"));
  assert.equal((await changeUser(request("/api/admin/users",approved,{id:person.id,note:"越权"}))).status,403);
  assert.equal((await changeUser(request("/api/admin/users",admin,{id:person.id,note:"x".repeat(501)}))).status,400);
  assert.equal((await changeUser(request("/api/admin/users",admin,{id:person.id,note:""}))).status,200);
  assert.equal((await query("SELECT admin_note FROM account_users WHERE id=$1",[person.id]))[0].admin_note,"");
});
test("rejected registrations cannot log in or be enabled without approval",async()=>{
  assert.equal((await register(registration("reject-test"))).status,201);
  const [person]=await query("SELECT id FROM account_users WHERE username='reject-test'");
  assert.equal((await changeUser(request("/api/admin/users",admin,{id:person.id,approval:"reject"}))).status,200);
  await assert.rejects(login("reject-test","eight888","reject-ip"),/未通过/);
  assert.equal((await changeUser(request("/api/admin/users",admin,{id:person.id,active:true}))).status,400);
});
test("registration validates size, origin, fields and persistent request limits",async()=>{
  const cross=registration("cross-test");cross.headers.set("origin","https://evil.test");assert.equal((await register(cross)).status,403);
  assert.equal((await register(registration("short-test",{password:"seven77"}))).status,400);
  assert.equal((await register(registration("blank-test",{displayName:"   "}))).status,400);
  assert.equal((await register(registration("large-test",{displayName:"x".repeat(5000)}))).status,413);
  const bad=request("/api/auth/register",null,{});assert.equal((await register(bad)).status,400);
  for(let i=0;i<10;i++){const result=await register(registration("rate-test"));assert.equal(result.status,i===0?201:409);}
  assert.equal((await register(registration("rate-test"))).status,429);
  assert.equal((await query("SELECT id FROM account_users WHERE username='rate-test'")).length,1);
  const concurrent=await Promise.all([register(registration("race-test")),register(registration("RACE-TEST"))]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[201,409]);
});
test("additive migration preserves legacy accounts, disabled state and existing notes",async()=>{
  const moduleName="node:sqlite";const {DatabaseSync}=await import(moduleName);const db=new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE account_users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,display_name TEXT NOT NULL,password_hash TEXT NOT NULL,role TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL); INSERT INTO account_users VALUES('legacy','legacy','原账号','hash','member',0,'2026-11-01');");
    const q=async(sql:string)=>db.prepare(sql).all();
    await initializeAccountSchema(q,false);
    let row=db.prepare("SELECT * FROM account_users WHERE id='legacy'").get();assert.equal(row.active,0);assert.equal(row.approval_status,"approved");assert.equal(row.password_hash,"hash");
    db.exec("UPDATE account_users SET admin_note='已有备注'");await initializeAccountSchema(q,false);
    row=db.prepare("SELECT * FROM account_users WHERE id='legacy'").get();assert.equal(row.admin_note,"已有备注");assert.equal(row.active,0);
  } finally {db.close();}
});
