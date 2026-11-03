import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "@/lib/account-db";
import { requireAccount, requireSameOrigin, accountError, AccountError, hashPassword, validateUser } from "@/lib/accounts";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireAccount(request, true);
    return Response.json({ users: await query("SELECT id,username,display_name,role,active,created_at FROM account_users ORDER BY created_at DESC") }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accountError(error); }
}
const newUser = z.object({ username: z.string(), displayName: z.string(), password: z.string(), role: z.enum(["admin", "member"]).default("member") });
export async function POST(request: Request) {
  try {
    requireSameOrigin(request); await requireAccount(request, true);
    const parsed = newUser.safeParse(await request.json());
    if (!parsed.success) throw new AccountError("员工信息格式无效。");
    const v = parsed.data; validateUser(v.username, v.displayName, v.password);
    await transaction(async (q) => {
      if ((await q("SELECT id FROM account_users WHERE username=$1", [v.username.toLowerCase()])).length) throw new AccountError("用户名已存在。");
      await q("INSERT INTO account_users(id,username,display_name,password_hash,role,created_at) VALUES($1,$2,$3,$4,$5,$6)", [randomUUID(),v.username.toLowerCase(),v.displayName.trim(),hashPassword(v.password),v.role,new Date().toISOString()]);
    });
    return Response.json({ ok: true });
  } catch (error) { return accountError(error); }
}
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request); const admin = await requireAccount(request, true);
    const parsed = z.object({ id:z.string().uuid(),active:z.boolean().optional(),password:z.string().min(12).max(128).optional() }).safeParse(await request.json());
    if (!parsed.success) throw new AccountError("修改信息格式无效，密码需至少 12 位。");
    const v = parsed.data;
    await transaction(async (q) => {
      const [user] = await q("SELECT * FROM account_users WHERE id=$1", [v.id]);
      if (!user) throw new AccountError("账号不存在。",404);
      if (v.active === false && v.id === admin.id) throw new AccountError("不能停用当前登录账号。");
      if (v.active !== undefined) await q("UPDATE account_users SET active=$1 WHERE id=$2", [v.active ? 1 : 0,v.id]);
      if (v.password) await q("UPDATE account_users SET password_hash=$1 WHERE id=$2", [hashPassword(v.password),v.id]);
      if (v.active === false || v.password) await q("DELETE FROM account_sessions WHERE user_id=$1", [v.id]);
    });
    return Response.json({ ok:true });
  } catch(error) { return accountError(error); }
}
