import { randomUUID } from "node:crypto";
import { z } from "zod";
import { query, transaction } from "@/lib/account-db";
import { requireAccount, requireSameOrigin, accountError, AccountError, hashPassword, validateUser } from "@/lib/accounts";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireAccount(request, true);
    return Response.json({ users: await query("SELECT id,username,display_name,role,active,approval_status,admin_note,created_at FROM account_users ORDER BY CASE WHEN approval_status='pending' THEN 0 ELSE 1 END,created_at DESC") }, { headers: { "Cache-Control": "no-store" } });
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
    const parsed = z.object({ id:z.string().uuid(),active:z.boolean().optional(),password:z.string().min(8).max(128).optional(),approval:z.enum(["approve","reject"]).optional(),note:z.string().trim().max(500).optional() }).strict().safeParse(await request.json());
    if (!parsed.success) throw new AccountError("修改信息格式无效，密码需为 8–128 位，备注最多 500 字。");
    const v = parsed.data;
    if(v.approval && (v.active!==undefined || v.password!==undefined))throw new AccountError("请分别提交审核与其他账号操作。");
    await transaction(async (q) => {
      const [user] = await q("SELECT * FROM account_users WHERE id=$1", [v.id]);
      if (!user) throw new AccountError("账号不存在。",404);
      if(v.approval) {
        if(user.approval_status!=="pending")throw new AccountError("这条申请已经处理，请刷新列表。",409);
        await q("UPDATE account_users SET approval_status=$1,active=$2 WHERE id=$3",[v.approval==="approve"?"approved":"rejected",v.approval==="approve"?1:0,v.id]);
        await q("DELETE FROM account_sessions WHERE user_id=$1",[v.id]);
      }
      if(v.active===true && user.approval_status!=="approved")throw new AccountError("此账号尚未审核通过，不能直接启用。");
      if (v.active === false && v.id === admin.id) throw new AccountError("不能停用当前登录账号。");
      if(v.note!==undefined)await q("UPDATE account_users SET admin_note=$1 WHERE id=$2",[v.note,v.id]);
      if (v.active !== undefined) await q("UPDATE account_users SET active=$1 WHERE id=$2", [v.active ? 1 : 0,v.id]);
      if (v.password) await q("UPDATE account_users SET password_hash=$1 WHERE id=$2", [hashPassword(v.password),v.id]);
      if (v.active === false || v.password) await q("DELETE FROM account_sessions WHERE user_id=$1", [v.id]);
    });
    return Response.json({ ok:true });
  } catch(error) { return accountError(error); }
}
