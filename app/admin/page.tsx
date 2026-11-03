"use client";
/* eslint-disable @next/next/no-img-element */
import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Users, ReceiptText, Activity, Upload, RefreshCw, X } from "lucide-react";
import { useAccount } from "@/components/AccountGate";

type User={id:string;username:string;display_name:string;role:string;active:number;approval_status:"pending"|"approved"|"rejected";admin_note:string;created_at:string};
type Summary={calls:number|string;billed:number|string;cost:string};
type Call={id:string;user_id:string;username:string;display_name:string;model:string;feature:string;prompt:string;status:string;started_at:string;finished_at:string|null;request_id:string|null;job_id:string|null;cost:string|null;media_id:string|null;storage_error:string|null;error:string|null;latency_ms:number|null};
type Overview={totals:Summary;byUser:(Summary&{id:string;username:string;display_name:string})[];byModel:(Summary&{model:string})[];calls:Call[];models:string[];unmatched:{count:number|string;cost:string};unmatchedRows:{request_id:string;model:string;billed_at:string;cost:string}[];imports:{id:string;filename:string;row_count:number;added_count:number;created_at:string;display_name:string}[];storage:{database:string;images:string;cloudReady:boolean}};
type ImportSummary={rows:number;added:number;duplicates:number;matched:number;unmatched:number;relinked:number;addedCost:string;committed:boolean};
const time=(v:string)=>new Date(v).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false});
const money=(v:string)=>v.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
const statusLabel:Record<string,string>={started:"已发起",accepted:"已受理",pending:"生成中",succeeded:"成功",failed:"失败",interrupted:"中断 · 费用待核对"};
async function api(url:string,init?:RequestInit) {
  const response=await fetch(url,init);const body=await response.json();
  if(response.status===401)window.dispatchEvent(new Event("pinwu-session-expired"));
  if(!response.ok)throw new Error(body.error||"请求失败");return body;
}
export default function AdminPage() {
  const {user}=useAccount();
  return user.role==="admin"?<AdminWorkspace/>:<main className="account-login"><p>此页面仅管理员可访问。</p><a href="/">返回平台</a></main>;
}
function AdminWorkspace() {
  const [tab,setTab]=useState("overview");const [users,setUsers]=useState<User[]>([]);const [data,setData]=useState<Overview|null>(null);
  const [error,setError]=useState("");const [notice,setNotice]=useState("");const [busy,setBusy]=useState(false);const [loading,setLoading]=useState(false);
  const [filters,setFilters]=useState({user:"",model:"",from:"",to:""});const [page,setPage]=useState(1);const [revision,setRevision]=useState(0);
  const [draft,setDraft]=useState({username:"",displayName:"",password:"",role:"member"});const [reset,setReset]=useState<User|null>(null);const [newPassword,setNewPassword]=useState("");
  const [file,setFile]=useState<File|null>(null);const [preview,setPreview]=useState<ImportSummary|null>(null);const [selected,setSelected]=useState<Call|null>(null);
  const [noteUser,setNoteUser]=useState<User|null>(null);const [note,setNote]=useState("");
  const pendingUsers=users.filter(u=>u.approval_status==="pending");
  const reviewedUsers=users.filter(u=>u.approval_status!=="pending");
  function editNote(u:User){setNoteUser(u);setNote(u.admin_note||"");}
  async function review(u:User,approval:"approve"|"reject") {
    if(approval==="reject"&&!window.confirm(`不批准「${u.display_name}（${u.username}）」的注册申请？`))return;
    await action(()=>api("/api/admin/users",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:u.id,approval})}),approval==="approve"?"申请已批准，该员工现在可以登录。":"申请已拒绝，该账号不能登录。");
  }
  useEffect(()=>{
    let cancelled=false;setLoading(true);setError("");
    Promise.all([api("/api/admin/users"),api(`/api/admin/overview?${new URLSearchParams({...filters,page:String(page)})}`)])
      .then(([u,d])=>{if(!cancelled){setUsers(u.users);setData(d);}}).catch(e=>{if(!cancelled)setError(e.message);}).finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[filters,page,revision]);
  async function action(fn:()=>Promise<unknown>,message:string) {
    setBusy(true);setError("");setNotice("");try {await fn();setNotice(message);setRevision(v=>v+1);}catch(e){setError(e instanceof Error?e.message:"操作失败");}finally{setBusy(false);}
  }
  async function createUser(e:FormEvent) {e.preventDefault();await action(async()=>{await api("/api/admin/users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(draft)});setDraft({username:"",displayName:"",password:"",role:"member"});},"账号已创建，可以使用用户名和密码登录。");}
  async function importFile(commit:boolean) {
    if(!file)return;
    await action(async()=>{const form=new FormData();form.set("file",file);form.set("commit",String(commit));setPreview(await api("/api/admin/billing",{method:"POST",body:form}));},commit?"账单已导入，已匹配费用已归集到员工账号。":"预览完成，尚未写入账单。");
  }
  return <main className="admin-shell">
    <header className="admin-header"><div><p className="account-eyebrow">PERDESIGN ADMIN</p><h1>使用与费用管理</h1><p className="account-muted">员工、模型调用与账单对账 · 不存储生成图片</p></div><a className="account-secondary" href="/"><ArrowLeft size={16}/>返回平台</a></header>
    <nav className="admin-tabs">{[["overview","使用概览",Activity],["users","员工账号",Users],["billing","账单对账",ReceiptText]].map(([id,label,Icon])=><button key={String(id)} className={tab===id?"active":""} onClick={()=>setTab(String(id))}>{typeof Icon!=="string"?<Icon size={17}/>:null}{String(label)}{id==="users"&&pendingUsers.length>0?<span className="admin-count-badge">{pendingUsers.length}</span>:null}</button>)}<button className="admin-refresh" disabled={loading} onClick={()=>setRevision(v=>v+1)}><RefreshCw size={15}/>{loading?"刷新中":"刷新"}</button></nav>
    {error?<p role="alert" className="account-error">{error}</p>:null}{notice?<p role="status" className="admin-notice">{notice}</p>:null}
    {data?<p className="admin-storage">{data.storage.database} · {data.storage.images}{!data.storage.cloudReady?" · 云端部署前需连接 PostgreSQL":""}</p>:null}
    {tab==="overview"?<>
      <div className="admin-filters"><label>员工<select value={filters.user} onChange={e=>{setPage(1);setFilters({...filters,user:e.target.value});}}><option value="">全部员工</option>{users.map(u=><option key={u.id} value={u.id}>{u.display_name}（{u.username}）{u.admin_note?` · ${u.admin_note}`:""}</option>)}</select></label><label>模型<select value={filters.model} onChange={e=>{setPage(1);setFilters({...filters,model:e.target.value});}}><option value="">全部模型</option>{data?.models.map(m=><option key={m}>{m}</option>)}</select></label><label>开始日期<input type="date" value={filters.from} onChange={e=>{setPage(1);setFilters({...filters,from:e.target.value});}}/></label><label>结束日期<input type="date" value={filters.to} onChange={e=>{setPage(1);setFilters({...filters,to:e.target.value});}}/></label></div>
      <p className="account-muted">按调用发起时间筛选（北京时间）。费用来自导入账单的 cost_usd，尚未核对人民币换算。</p>
      <div className="admin-stats"><div><span>调用次数（含重试）</span><strong>{data?.totals.calls||0}</strong></div><div><span>已对账费用 · cost_usd</span><strong>{money(data?.totals.cost||"0")}</strong></div><div><span>尚未对账的调用</span><strong>{Number(data?.totals.calls||0)-Number(data?.totals.billed||0)}</strong></div></div>
      <div className="admin-summary-grid"><section className="admin-card"><h2>员工费用</h2><div className="admin-table-wrap"><table><thead><tr><th>员工</th><th>调用</th><th>已对账</th><th>费用</th></tr></thead><tbody>{data?.byUser.map(r=><tr key={r.id}><td>{r.display_name}<small>{r.username}</small></td><td>{r.calls}</td><td>{r.billed}</td><td>{money(r.cost)}</td></tr>)}</tbody></table></div>{!data?.byUser.length?<p className="admin-empty">暂无调用记录</p>:null}</section><section className="admin-card"><h2>模型费用</h2><div className="admin-table-wrap"><table><thead><tr><th>模型</th><th>调用</th><th>已对账</th><th>费用</th></tr></thead><tbody>{data?.byModel.map(r=><tr key={r.model}><td>{r.model}</td><td>{r.calls}</td><td>{r.billed}</td><td>{money(r.cost)}</td></tr>)}</tbody></table></div></section></div>
      <section className="admin-card"><h2>调用明细</h2><div className="admin-table-wrap"><table><thead><tr><th>时间 / 员工</th><th>功能 / 模型</th><th>状态</th><th>账单费用</th><th>调用详情</th></tr></thead><tbody>{data?.calls.map(c=><tr key={c.id}><td>{time(c.started_at)}<small>{c.display_name} · {c.username}</small></td><td>{c.feature}<small>{c.model}</small></td><td>{statusLabel[c.status]||c.status}{c.storage_error?<small className="account-error">图片未归档</small>:null}</td><td>{c.cost===null?<span className="admin-pending">待对账</span>:money(c.cost)}</td><td><button className="admin-detail-button" onClick={()=>setSelected(c)}>{c.media_id?<img src={`/api/account/media?id=${c.media_id}`} alt="生成结果缩略图" loading="lazy"/>:"查看详情"}</button></td></tr>)}</tbody></table></div>{!data?.calls.length?<p className="admin-empty">账号系统上线后的调用将显示在这里。</p>:null}<div className="admin-pagination"><button disabled={page===1||loading} onClick={()=>setPage(v=>v-1)}>上一页</button><span>第 {page} 页</span><button disabled={page*50>=Number(data?.totals.calls||0)||loading} onClick={()=>setPage(v=>v+1)}>下一页</button></div></section>
    </>:null}
    {tab==="users"?<>
      <section className="admin-card">
        <h2>待审批注册 <span className="admin-count-badge">{pendingUsers.length}</span></h2>
        <p className="account-muted">批准后才能登录和使用模型，请先确认申请人身份。</p>
        {pendingUsers.length?<div className="admin-table-wrap"><table><thead><tr><th>姓名 / 用户名</th><th>申请时间</th><th>管理员备注</th><th>审批</th></tr></thead><tbody>
          {pendingUsers.map(u=><tr key={u.id}><td>{u.display_name}<small>{u.username}</small></td><td>{time(u.created_at)}</td>
            <td className="admin-note-cell"><span>{u.admin_note||"未添加备注"}</span><button className="admin-detail-button" disabled={busy} onClick={()=>editNote(u)}>编辑备注</button></td>
            <td><div className="admin-row-actions"><button className="account-primary" disabled={busy} onClick={()=>void review(u,"approve")}>批准</button><button disabled={busy} onClick={()=>void review(u,"reject")}>拒绝</button></div></td>
          </tr>)}
        </tbody></table></div>:<p className="admin-empty">暂无待审批注册</p>}
      </section>
      <section className="admin-card"><h2>直接创建员工账号</h2><p className="account-muted">管理员直接创建的账号无需再次审批。</p>
        <form className="admin-user-form" onSubmit={createUser}>
          <label>姓名<input required value={draft.displayName} maxLength={60} onChange={e=>setDraft({...draft,displayName:e.target.value})}/></label>
          <label>用户名<input required autoComplete="off" value={draft.username} maxLength={40} onChange={e=>setDraft({...draft,username:e.target.value})}/></label>
          <label>初始密码<input required type="password" autoComplete="new-password" minLength={8} maxLength={128} placeholder="至少 8 位" value={draft.password} onChange={e=>setDraft({...draft,password:e.target.value})}/></label>
          <label>权限<select value={draft.role} onChange={e=>setDraft({...draft,role:e.target.value})}><option value="member">员工</option><option value="admin">管理员</option></select></label><button disabled={busy} className="account-primary">创建账号</button>
        </form>
      </section>
      <section className="admin-card"><h2>员工列表</h2><p className="account-muted">备注仅管理员可见，不会修改注册姓名或用户名。</p>
        <div className="admin-table-wrap"><table><thead><tr><th>姓名</th><th>用户名</th><th>管理员备注</th><th>权限</th><th>状态</th><th>管理</th></tr></thead><tbody>{reviewedUsers.map(u=><tr key={u.id}>
          <td>{u.display_name}</td><td>{u.username}</td><td className="admin-note-cell"><span>{u.admin_note||"未添加备注"}</span><button className="admin-detail-button" disabled={busy} onClick={()=>editNote(u)}>编辑备注</button></td>
          <td>{u.role==="admin"?"管理员":"员工"}</td><td>{u.approval_status==="rejected"?"注册未通过":u.active?"启用":"停用"}</td>
          <td>{u.approval_status==="approved"?<div className="admin-row-actions"><button disabled={busy} onClick={()=>{setReset(u);setNewPassword("");}}>重置密码</button><button disabled={busy} onClick={()=>void action(()=>api("/api/admin/users",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:u.id,active:!u.active})}),u.active?"账号已停用，现有登录已失效。":"账号已启用。")}>{u.active?"停用":"启用"}</button></div>:<span className="account-muted">未获得使用权限</span>}</td>
        </tr>)}</tbody></table></div>
      </section>
    </>:null}
    {tab==="billing"?<><section className="admin-card"><h2>导入 65535 请求日志</h2><p className="account-muted">先预览再确认。仅使用唯一请求编号或任务 UA 精确匹配；历史调用、未知来源和模型不一致的记录保留待核对。</p><div className="admin-upload"><input type="file" accept=".csv,text/csv" disabled={busy} onChange={e=>{setFile(e.target.files?.[0]||null);setPreview(null);setNotice("");}}/><button className="account-secondary" disabled={!file||busy} onClick={()=>void importFile(false)}><Upload size={16}/>预览账单</button></div>{preview?<div className="admin-import-preview"><p>共 {preview.rows} 条；新增 {preview.added} 条，重复 {preview.duplicates} 条。</p><p>可归属员工 {preview.matched} 条，待核对 {preview.unmatched} 条，重新匹配 {preview.relinked} 条。</p><p>新增账单费用：{money(preview.addedCost)}（cost_usd）</p><button disabled={busy||preview.committed} className="account-primary" onClick={()=>void importFile(true)}>{preview.committed?"已导入":"确认导入"}</button></div>:null}</section><section className="admin-card"><h2>全公司待核对账单 · {data?.unmatched.count||0} 条</h2><p className="account-muted">合计 {money(data?.unmatched.cost||"0")}（cost_usd），未计入任何员工费用。这里不受使用概览筛选条件影响。</p><div className="admin-table-wrap"><table><thead><tr><th>时间</th><th>模型</th><th>请求编号</th><th>费用</th></tr></thead><tbody>{data?.unmatchedRows.map(r=><tr key={r.request_id}><td>{time(r.billed_at)}</td><td>{r.model}</td><td><code>{r.request_id}</code></td><td>{money(r.cost)}</td></tr>)}</tbody></table></div>{Number(data?.unmatched.count)>50?<p className="account-muted">显示最近 50 条。</p>:null}</section><section className="admin-card"><h2>最近导入记录</h2>{data?.imports.map(r=><p key={r.id} className="admin-import-row">{time(r.created_at)} · {r.filename} · 新增 {r.added_count}/{r.row_count} 条 · {r.display_name}</p>)}</section></>:null}
    {selected?<div className="admin-modal-backdrop" onClick={()=>setSelected(null)}><section className="admin-modal" role="dialog" aria-modal="true" aria-label="调用详情" onClick={e=>e.stopPropagation()}><button className="admin-modal-close" onClick={()=>setSelected(null)} aria-label="关闭"><X/></button><h2>{selected.display_name} · {selected.feature}</h2><p className="account-muted">{selected.model} · {time(selected.started_at)}</p>{selected.media_id?<a href={`/api/account/media?id=${selected.media_id}`} target="_blank" rel="noreferrer"><img className="admin-result-image" src={`/api/account/media?id=${selected.media_id}`} alt="生成图片"/></a>:null}<h3>提示词摘要（最多 1000 字符）</h3><pre>{selected.prompt||"本次未记录文字提示"}</pre><p>调用编号：<code>{selected.id}</code></p><p>供应商请求编号：<code>{selected.request_id||"未返回，使用任务 UA 对账"}</code></p><p>费用：{selected.cost===null?"待对账":`${money(selected.cost)}（cost_usd）`}</p>{selected.storage_error?<p className="account-error">{selected.storage_error}</p>:null}{selected.error?.startsWith("artifact:https://")?<a href={selected.error.slice(9)} target="_blank" rel="noreferrer">打开生成的视频 / 模型</a>:selected.error?<p className="account-error">{selected.error}</p>:null}</section></div>:null}
    {reset?<div className="admin-modal-backdrop"><form className="admin-modal" onSubmit={e=>{e.preventDefault();void action(async()=>{await api("/api/admin/users",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:reset.id,password:newPassword})});setReset(null);setNewPassword("");},"密码已重置，原有登录已失效。");}}><h2>重置 {reset.display_name} 的密码</h2><label>新密码<input type="password" autoComplete="new-password" required minLength={8} maxLength={128} value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><div className="admin-row-actions"><button type="button" onClick={()=>setReset(null)}>取消</button><button className="account-primary" disabled={busy}>确认重置</button></div></form></div>:null}
    {noteUser?<div className="admin-modal-backdrop"><form className="admin-modal" role="dialog" aria-modal="true" aria-label="编辑管理员备注" onSubmit={e=>{e.preventDefault();void action(async()=>{await api("/api/admin/users",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:noteUser.id,note})});setNoteUser(null);setNote("");},"备注已保存，仅管理员可见。");}}>
      <h2>备注 · {noteUser.display_name}（{noteUser.username}）</h2>
      <p className="account-muted">用于管理员识别员工，例如真实姓名、部门或团队；不会展示给员工。</p>
      <label>管理员备注<textarea rows={4} maxLength={500} value={note} onChange={e=>setNote(e.target.value)} placeholder="例如：张三 · 工业设计组"/></label>
      <p className="account-muted">{note.length}/500 字，清空后保存可删除备注。</p>
      {error?<p role="alert" className="account-error">{error}</p>:null}
      <div className="admin-row-actions"><button type="button" disabled={busy} onClick={()=>setNoteUser(null)}>取消</button><button className="account-primary" disabled={busy}>{busy?"保存中":"保存备注"}</button></div>
    </form></div>:null}
  </main>;
}
