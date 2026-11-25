"use client";
import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { LockKeyhole, Loader2, LogOut, ShieldCheck } from "lucide-react";
import type { Account } from "@/lib/accounts";
import { setStorageAccount } from "@/lib/account-storage";
import { copyLegacyHistory } from "@/lib/legacy-account-history";

const AccountContext=createContext<{user:Account;logout:()=>Promise<void>}|null>(null);
export function useAccount() {
  const value=useContext(AccountContext);
  if(!value) throw new Error("AccountGate missing");
  return value;
}
export function AccountGate({children}:{children:ReactNode}) {
  const [user,setUser]=useState<Account|null>(null);
  const [emergency,setEmergency]=useState(false);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [username,setUsername]=useState("");
  const [password,setPassword]=useState("");
  const [mode,setMode]=useState<"login"|"register">("login");
  const [displayName,setDisplayName]=useState("");
  const [notice,setNotice]=useState("");
  const previousAccount=useRef("");
  const userId=user?.id;
  function acceptUser(next:Account|null) {
    // A full reload prevents old asynchronous jobs writing into another account's browser storage.
    if(previousAccount.current && previousAccount.current!==next?.id) { window.location.reload(); return; }
    previousAccount.current=next?.id||"";
    setStorageAccount(next?.id||""); setUser(next);
  }
  useEffect(()=>{
    if(!userId)return;
    const original=window.fetch;
    window.fetch=async(input,init)=>{
      const url=new URL(input instanceof Request?input.url:String(input),window.location.href);
      if(url.origin!==window.location.origin || !url.pathname.startsWith("/api/") || url.pathname.startsWith("/api/auth/"))return original(input,init);
      const headers=new Headers(init?.headers || (input instanceof Request?input.headers:undefined));
      headers.set("X-Pinwu-Account",userId);
      const response=await original(input,{...init,headers});
      if(response.status===401)window.dispatchEvent(new Event("pinwu-session-expired"));
      return response;
    };
    return()=>{window.fetch=original;};
  },[userId]);
  useEffect(()=>{
    let active=true;
    async function refresh() {
      try {
        const response=await fetch("/api/auth/me",{cache:"no-store"}); const body=await response.json();
        if(!response.ok) throw new Error(body.error||"账号服务暂时不可用。");
        if(active) {setEmergency(Boolean(body.emergency));acceptUser(body.user);setError("");}
      } catch(error) {if(active) setError(error instanceof Error?error.message:"无法连接账号服务。");}
      finally {if(active)setReady(true);}
    }
    const expire=()=>{acceptUser(null);setError("登录已失效，请重新登录。");};
    void refresh();
    const timer=window.setInterval(()=>void refresh(),60000);
    window.addEventListener("focus",refresh); window.addEventListener("pinwu-session-expired",expire);
    return ()=>{active=false;window.clearInterval(timer);window.removeEventListener("focus",refresh);window.removeEventListener("pinwu-session-expired",expire);};
  },[]);
  async function submit(event:FormEvent) {
    event.preventDefault();setBusy(true);setError("");setNotice("");
    try {
      const registering=!emergency&&mode==="register";
      const response=await fetch(registering?"/api/auth/register":"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(registering?{username,displayName,password}:{username,password})});
      const body=await response.json(); if(!response.ok)throw new Error(body.error);
      setPassword("");
      if(registering){setMode("login");setDisplayName("");setNotice(body.message);}
      else acceptUser(body.user);
    } catch(error) {setError(error instanceof Error?error.message:"提交失败，请重试。");}
    finally {setBusy(false);}
  }
  async function logout() {
    const response=await fetch("/api/auth/logout",{method:"POST"});
    if(!response.ok){setError("退出失败，请重试。");return;}
    acceptUser(null);window.location.assign("/");
  }
  if(!ready) return <div className="account-login"><Loader2 className="animate-spin"/><span>正在检查登录状态</span></div>;
  if(user) return <AccountContext.Provider value={{user,logout}}><div key={user.id}>{emergency?<div role="status" style={{padding:"6px 16px",background:"#292332",color:"#e8dfff",fontSize:13,textAlign:"center"}}>临时工作模式 · 员工记账暂停 · 原账号与历史数据保留，新作品请及时下载</div>:null}{children}</div></AccountContext.Provider>;
  if(emergency)return <main className="account-login"><form className="account-login-card" onSubmit={submit}>
    <div className="account-login-icon"><LockKeyhole/></div><p className="account-eyebrow">PERDESIGN AI</p><h1>临时工作入口</h1>
    <p className="account-muted">账号服务维护中，输入公司内部临时访问码即可继续使用。原有账号、账单与本机历史不会删除。</p>
    <label>临时访问码<input type="password" autoComplete="off" value={password} onChange={e=>setPassword(e.target.value)} required maxLength={128} placeholder="输入临时访问码"/></label>
    {error?<p role="alert" className="account-error">{error}</p>:null}
    <button className="account-primary" disabled={busy}>{busy?"正在进入":"进入工作台"}</button>
    <p className="account-footnote">临时工作区与原账号历史隔离；本阶段不记录员工费用，请下载保存重要成果。</p>
  </form></main>;
  return <main className="account-login"><form className="account-login-card" onSubmit={submit}>
    <div className="account-login-icon"><LockKeyhole/></div><p className="account-eyebrow">PERDESIGN AI</p><h1>{mode==="register"?"注册品物创意平台":"登录品物创意平台"}</h1><p className="account-muted">{mode==="register"?"填写以下信息提交申请，管理员批准后即可使用。":"登录已有账号，或注册账号后等待管理员批准。"}</p>
    {notice?<p role="status" className="admin-notice">{notice}</p>:null}
    {mode==="register"?<label>姓名<input autoComplete="name" value={displayName} onChange={e=>setDisplayName(e.target.value)} required maxLength={60} placeholder="输入姓名或常用称呼"/></label>:null}
    <label>用户名<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required minLength={mode==="register"?3:undefined} maxLength={40} pattern={mode==="register"?"[a-zA-Z0-9_.\\-]{3,40}":undefined} placeholder={mode==="register"?"3–40 位字母、数字、点、下划线或短横线":"输入用户名"}/></label>
    <label>密码<input type="password" autoComplete={mode==="register"?"new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)} required minLength={mode==="register"?8:undefined} maxLength={128} placeholder={mode==="register"?"至少 8 位":"输入密码"}/></label>
    {error?<p role="alert" className="account-error">{error}</p>:null}
    <button className="account-primary" disabled={busy}>{busy?<Loader2 className="animate-spin"/>:null}{busy?"正在提交":mode==="register"?"提交注册申请":"登录"}</button>
    <button type="button" className="account-mode-switch" disabled={busy} onClick={()=>{setMode(mode==="login"?"register":"login");setPassword("");setError("");setNotice("");}}>{mode==="register"?"已有账号？返回登录":"还没有账号？申请注册"}</button>
    <p className="account-footnote">注册申请需管理员批准。模型使用、调用记录及账单费用将记录到你的账号，供公司管理员查看。</p>
  </form></main>;
}
export function AccountPanel() {
  const {user,logout}=useAccount();
  const [migration,setMigration]=useState("");const [copying,setCopying]=useState(false);
  async function migrate() {
    if(!window.confirm(`将此浏览器上线账号系统前的聊天、导图和画廊复制到当前账号「${user.displayName}（${user.username}）」？请确认这些旧记录属于你；共用电脑请勿导入他人的历史。原记录会保留，已有同编号记录不会被覆盖。`))return;
    setCopying(true);
    try{const count=await copyLegacyHistory();setMigration(`已复制 ${count} 条旧记录。刷新页面后查看，原记录仍保留。`);}
    catch(e){setMigration(e instanceof Error?e.message:"复制失败，原记录仍保留，可重试。");}
    finally{setCopying(false);}
  }
  return <section className="section-surface">
    <div className="section-header"><div><h1 className="section-title">我的账号</h1><p className="section-subtitle">已登录，可使用平台功能</p></div></div>
    <div className="account-panel">
      <ShieldCheck/><h2>{user.displayName}</h2>
      <p className="account-muted">{user.username} · {user.role==="admin"?"管理员":"员工"}</p>
      {user.role==="admin"?<a className="account-primary" href="/admin">打开管理后台</a>:null}
      <button className="account-secondary" disabled={copying} onClick={()=>void migrate()}>{copying?"正在复制旧历史":"导入此浏览器的旧历史"}</button>
      <p className="account-muted">仅复制此浏览器、当前网址下账号系统上线前的旧历史到当前账号，原记录不会删除。共用电脑请确认旧记录属于你。</p>
      {migration?<p role="status" className="account-muted">{migration}</p>:null}
      <button className="account-secondary" onClick={()=>void logout()}><LogOut size={16}/>退出登录</button>
    </div>
  </section>;
}
