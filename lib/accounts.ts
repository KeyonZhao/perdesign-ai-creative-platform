import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { query, transaction, type DbRow } from "./account-db";

export const SESSION_COOKIE = "pinwu_session";
export type Account = { id: string; username: string; displayName: string; role: "admin" | "member" };
export class AccountError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function publicAccount(row: DbRow): Account { return { id: row.id, username: row.username, displayName: row.display_name, role: row.role }; }
export function hashToken(value: string) { return createHash("sha256").update(value).digest("hex"); }
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function checkPassword(password: string, hash: string) {
  const [salt, expected] = hash.split(":");
  if (!salt || !expected || expected.length !== 128) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(expected, "hex"));
}
export function validateUser(username: string, displayName: string, password: string) {
  if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) throw new AccountError("用户名需为 3–40 位字母、数字、点、下划线或短横线。");
  if (!displayName.trim() || displayName.length > 60) throw new AccountError("请输入 1–60 字姓名。");
  if (password.length < 8 || password.length > 128) throw new AccountError("密码需为 8–128 位。");
}
export async function createAccount(username: string, displayName: string, password: string, role: "admin" | "member" = "member") {
  validateUser(username, displayName, password);
  const id = randomUUID();
  await query("INSERT INTO account_users (id,username,display_name,password_hash,role,created_at) VALUES ($1,$2,$3,$4,$5,$6)", [id, username.toLowerCase(), displayName.trim(), hashPassword(password), role, new Date().toISOString()]);
  return id;
}
export function sessionToken(request: Request) {
  return request.headers.get("cookie")?.split(";").map((v) => v.trim()).find((v) => v.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1) || "";
}
export async function getAccount(request: Request): Promise<Account | null> {
  const token = sessionToken(request);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const rows = await query("SELECT u.* FROM account_sessions s JOIN account_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>$2 AND u.active=1 AND u.approval_status='approved'", [hashToken(token), new Date().toISOString()]);
  return rows[0] ? publicAccount(rows[0]) : null;
}
export async function requireAccount(request: Request, admin = false) {
  const user = await getAccount(request);
  if (!user) throw new AccountError("登录已过期，请重新登录。", 401);
  const expectedUser=request.headers.get("x-pinwu-account");
  if(expectedUser && expectedUser!==user.id) throw new AccountError("账号已在其他页面切换，请刷新后重试。",401);
  if (admin && user.role !== "admin") throw new AccountError("仅管理员可以访问。", 403);
  return user;
}
export function requireSameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  const expected = process.env.PINWU_APP_ORIGIN || new URL(request.url).origin;
  if (!origin || origin !== expected || request.headers.get("sec-fetch-site") === "cross-site") throw new AccountError("请求来源无效。", 403);
}
export async function login(username: string, password: string, ip: string) {
  if (password.length > 128 || username.length > 40) throw new AccountError("用户名或密码不正确。", 401);
  const now = new Date().toISOString();
  const limits = [hashToken(`user:${username.toLowerCase()}`), hashToken(`ip:${ip}`)];
  await transaction(async (q) => {
    await q("DELETE FROM account_login_limits WHERE expires_at<$1", [now]);
    for (const id of limits) {
      const [row] = await q("SELECT attempts FROM account_login_limits WHERE id=$1", [id]);
      if (row && row.attempts >= 15) throw new AccountError("登录尝试过多，请 15 分钟后再试。", 429);
      await q("INSERT INTO account_login_limits (id,attempts,expires_at) VALUES ($1,1,$2) ON CONFLICT(id) DO UPDATE SET attempts=account_login_limits.attempts+1", [id, new Date(Date.now() + 900000).toISOString()]);
    }
  });
  const [row] = await query("SELECT * FROM account_users WHERE username=$1", [username.toLowerCase()]);
  const valid = checkPassword(password, row?.password_hash || `${"0".repeat(32)}:${"0".repeat(128)}`);
  if (!row || !valid) throw new AccountError("用户名或密码不正确。", 401);
  if (row.approval_status === "pending") throw new AccountError("注册申请正在等待管理员批准，批准后即可登录。", 403);
  if (row.approval_status === "rejected") throw new AccountError("注册申请未通过，请联系管理员。", 403);
  if (!row.active || row.approval_status !== "approved") throw new AccountError("账号已停用，请联系管理员。", 403);
  const token = randomBytes(32).toString("hex");
  await query("INSERT INTO account_sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)", [hashToken(token), row.id, new Date(Date.now() + 7 * 86400000).toISOString()]);
  await query("DELETE FROM account_sessions WHERE expires_at<$1", [now]);
  await query("DELETE FROM account_login_limits WHERE id=$1", [limits[0]]);
  await query("UPDATE account_login_limits SET attempts=CASE WHEN attempts>0 THEN attempts-1 ELSE 0 END WHERE id=$1", [limits[1]]);
  return { token, user: publicAccount(row) };
}
export function accountError(error: unknown) {
  if (error instanceof AccountError) return Response.json({ error: error.message }, { status: error.status });
  console.error("Account operation failed", error instanceof Error ? error.name : "unknown");
  return Response.json({ error: "账号服务暂时不可用，请检查数据库配置或联系管理员。" }, { status: 503 });
}

export async function registerAccount(username:string, displayName:string, password:string, ip:string) {
  validateUser(username,displayName,password);
  const now=new Date().toISOString();
  // Separate persistent budget; rejected/duplicate attempts also consume it.
  await transaction(async q=>{
    await q("DELETE FROM account_login_limits WHERE expires_at<$1",[now]);
    const key=hashToken(`register-ip:${ip}`);
    const [limit]=await q("SELECT attempts FROM account_login_limits WHERE id=$1",[key]);
    if(limit && limit.attempts>=10)throw new AccountError("注册请求过多，请一小时后再试。",429);
    await q("INSERT INTO account_login_limits(id,attempts,expires_at) VALUES($1,1,$2) ON CONFLICT(id) DO UPDATE SET attempts=account_login_limits.attempts+1",[key,new Date(Date.now()+3600000).toISOString()]);
  });
  const passwordHash=hashPassword(password);
  await transaction(async q=>{
    if((await q("SELECT id FROM account_users WHERE username=$1",[username.toLowerCase()])).length)throw new AccountError("用户名已被使用，请选择其他用户名；如果已经注册，请等待审核或直接登录。",409);
    await q("INSERT INTO account_users(id,username,display_name,password_hash,role,active,approval_status,created_at) VALUES($1,$2,$3,$4,'member',0,'pending',$5)",[randomUUID(),username.toLowerCase(),displayName.trim(),passwordHash,now]);
  });
}
