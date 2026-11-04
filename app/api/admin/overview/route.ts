import { query } from "@/lib/account-db";
import { requireAccount, accountError, AccountError } from "@/lib/accounts";
import { nanoToCost } from "@/lib/billing-import";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    await requireAccount(request,true);
    const p = new URL(request.url).searchParams;
    const filters: string[] = ["1=1"]; const values: unknown[] = [];
    function where(sql:string, value:unknown) { values.push(value); filters.push(sql.replace("?", `$${values.length}`)); }
    if (p.get("user")) where("c.user_id=?",p.get("user"));
    if (p.get("model")) where("c.model=?",p.get("model"));
    for (const [name,op] of [["from",">="],["to","<"]]) {
      const v=p.get(name); if (!v) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v))) throw new AccountError("日期无效。");
      const date=new Date(`${v}T00:00:00+08:00`); if(name==="to") date.setTime(date.getTime()+86400000);
      where(`c.started_at${op}?`,date.toISOString());
    }
    const condition = filters.join(" AND ");
    const join = " FROM account_calls c JOIN account_users u ON u.id=c.user_id LEFT JOIN account_bills b ON b.call_id=c.id ";
    const counts="COUNT(*) AS calls,COUNT(b.cost_nano) AS billed,COUNT(b.request_id)-COUNT(b.cost_nano) AS missing_cost,COUNT(*)-COUNT(b.request_id) AS missing_bill,COALESCE(SUM(b.cost_nano),0) AS cost";
    const totals=(await query("SELECT "+counts+join+"WHERE "+condition,values))[0];
    const byUser=await query("SELECT u.id,u.username,u.display_name,"+counts+join+"WHERE "+condition+" GROUP BY u.id,u.username,u.display_name ORDER BY cost DESC",values);
    const byModel=await query("SELECT c.model,"+counts+join+"WHERE "+condition+" GROUP BY c.model ORDER BY cost DESC",values);
    const page=Math.max(1,Math.min(100000,Number(p.get("page"))||1));
    const calls=await query("SELECT c.*,u.username,u.display_name,b.cost_nano,b.request_id AS bill_request_id"+join+"WHERE "+condition+` ORDER BY c.started_at DESC LIMIT 50 OFFSET $${values.length+1}`,[...values,(Math.floor(page)-1)*50]);
    const unmatched=(await query("SELECT COUNT(*) AS count,COUNT(*)-COUNT(cost_nano) AS missing_cost,COALESCE(SUM(cost_nano),0) AS cost FROM account_bills WHERE call_id IS NULL"))[0];
    const unmatchedRows=await query("SELECT request_id,model,billed_at,cost_nano FROM account_bills WHERE call_id IS NULL ORDER BY billed_at DESC LIMIT 50");
    const imports=await query("SELECT i.id,i.filename,i.row_count,i.added_count,i.created_at,u.display_name FROM account_imports i JOIN account_users u ON u.id=i.user_id ORDER BY i.created_at DESC LIMIT 10");
    const models=await query("SELECT DISTINCT model FROM account_calls ORDER BY model");
    const format=(row:any)=>({...row,cost:nanoToCost(row.cost)});
    return Response.json({totals:format(totals),byUser:byUser.map(format),byModel:byModel.map(format),calls:calls.map(c=>({...c,cost:c.cost_nano===null?null:nanoToCost(c.cost_nano),cost_nano:undefined})),unmatched:format(unmatched),unmatchedRows:unmatchedRows.map(r=>({...r,cost:r.cost_nano===null?null:nanoToCost(r.cost_nano),cost_nano:undefined})),imports,models:models.map(r=>r.model),page,storage:{database:process.env.DATABASE_URL||process.env.POSTGRES_URL?"PostgreSQL":"本地数据库",images:"仅记录数据 · 不归档图片",cloudReady:Boolean(process.env.DATABASE_URL||process.env.POSTGRES_URL)}},{headers:{"Cache-Control":"no-store"}});
  } catch(error) { return accountError(error); }
}
