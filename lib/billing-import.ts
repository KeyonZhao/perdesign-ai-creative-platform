import { parse } from "csv-parse/sync";
import { createHash, randomUUID } from "node:crypto";
import { AccountError } from "./accounts";
import { transaction, type Query } from "./account-db";

// Supplier identifiers are opaque: text UUIDs and image img_<hex> IDs both occur in real exports.
const ID = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,199}$/;
type BillingRecord = { requestId: string; model: string; requestedModel: string; costNano: number | null; time: string; ua: string; status: string };

// A supplier retry can reuse an ID: retain the successful charged result, not
// its earlier unpriced failure. Never reconcile different identities or fees.
function reconcileRecord(a: BillingRecord, b: BillingRecord): BillingRecord | null {
  if (a.requestId !== b.requestId || a.model !== b.model || a.ua !== b.ua ||
    (a.requestedModel && b.requestedModel && a.requestedModel !== b.requestedModel)) return null;
  if (a.costNano === b.costNano && a.time === b.time && a.status === b.status) return a;
  // Repeated unpriced failures may differ only in attempt time. Keep the latest
  // failure without treating an absent fee as zero or merging different states.
  if (a.costNano === null && b.costNano === null && a.status === b.status && /^[45]\d\d$/.test(a.status)) {
    const latest = Date.parse(a.time) >= Date.parse(b.time) ? a : b;
    return { ...latest, requestedModel: a.requestedModel || b.requestedModel };
  }
  if ((a.costNano === null) === (b.costNano === null)) return null;
  const known = a.costNano !== null ? a : b;
  const unknown = a.costNano === null ? a : b;
  // Preserve the existing same-timestamp missing-fee backfill behavior.
  if (known.time === unknown.time) return known;
  if (/^2\d\d$/.test(known.status) && /^[45]\d\d$/.test(unknown.status) &&
    Date.parse(known.time) > Date.parse(unknown.time)) return known;
  return null;
}
export function costToNano(value: string) {
  if (!/^\d{1,7}(?:\.\d{1,9})?$/.test(value)) throw new AccountError("费用格式无效，需非负数且最多 9 位小数。");
  const [integer, fraction = ""] = value.split(".");
  const amount = BigInt(integer) * 1000000000n + BigInt(fraction.padEnd(9, "0"));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new AccountError("费用超出可核算范围。");
  return Number(amount);
}
export function nanoToCost(value: number | string) {
  const amount = BigInt(value);
  return `${amount / 1000000000n}.${(amount % 1000000000n).toString().padStart(9, "0")}`;
}
export function parseBillingCsv(csv: string) {
  if (Buffer.byteLength(csv) > 8 * 1024 * 1024) throw new AccountError("账单文件不能超过 8MB。");
  let columns: string[] = [];
  let rows: Record<string, string>[];
  try { rows = parse(csv, { bom: true, skip_empty_lines: true, max_record_size: 20000, columns: (header: string[]) => { columns = header; return header; } }); }
  catch { throw new AccountError("CSV 格式无法解析，请使用 65535 后台原始导出文件。"); }
  if (!rows.length || rows.length > 10000) throw new AccountError("每次请导入 1–10000 条记录。");
  if (new Set(columns).size !== columns.length || ["request_id", "model", "cost_usd", "time", "user_agent", "status"].some((key) => !columns.includes(key))) throw new AccountError("缺少请求编号、模型、费用、时间、UA 或状态列，或存在重复列名。");
  const seen = new Map<string, BillingRecord>();
  const records = rows.map((r, i) => {
    if (!ID.test(r.request_id) || !r.model || r.model.length > 150 || !Number.isFinite(Date.parse(r.time)) || !/(Z|[+-]\d\d:\d\d)$/.test(r.time)) throw new AccountError(`第 ${i + 2} 行的编号、模型或时间格式无效。`);
    if (r.user_agent.length > 1000) throw new AccountError(`第 ${i + 2} 行 UA 过长。`);
    let costNano: number | null = null;
    if (r.cost_usd.trim()) {
      try { costNano = costToNano(r.cost_usd.trim()); }
      catch (error) { throw new AccountError(`第 ${i + 2} 条 CSV 记录（含表头）的 cost_usd 无效：${error instanceof Error ? error.message : "费用格式无效"}`); }
    }
    const record = { requestId: r.request_id, model: r.model, requestedModel: r.requested_model || "", costNano, time: new Date(r.time).toISOString(), ua: r.user_agent, status: r.status.slice(0, 60) };
    const previous = seen.get(record.requestId);
    const resolved = previous ? reconcileRecord(previous, record) : record;
    if (!resolved) throw new AccountError(`同一请求编号存在不同内容：第 ${i + 2} 行。`);
    seen.set(record.requestId, resolved);
    return record;
  });
  // Keep source row counts for the preview; every occurrence uses the same
  // resolved record so import order cannot change the charged result.
  return records.map((record) => seen.get(record.requestId)!);
}
async function matchCall(q: Query, record: ReturnType<typeof parseBillingCsv>[number]) {
  const ua = /^Pinwu\/1\.0 call\/[a-f0-9-]{36}$/.test(record.ua) ? record.ua : "";
  const matches = await q("SELECT id,model FROM account_calls WHERE provider='65535' AND (request_id=$1 OR user_agent=$2)", [record.requestId, ua]);
  if (matches.length !== 1 || (matches[0].model !== record.model && matches[0].model !== record.requestedModel)) return null;
  const [alreadyBilled] = await q("SELECT request_id FROM account_bills WHERE call_id=$1 AND request_id<>$2", [matches[0].id, record.requestId]);
  return alreadyBilled ? null : matches[0].id as string;
}
export async function importBilling(csv: string, filename: string, userId: string, commit: boolean) {
  const rows = parseBillingCsv(csv);
  return transaction(async (q) => {
    const importId = randomUUID();
    const now = new Date().toISOString();
    const summary = { rows: rows.length, added: 0, duplicates: 0, matched: 0, unmatched: 0, relinked: 0, missingCost: 0, updatedCosts: 0, addedCost: "0.000000000", unmatchedExamples: [] as { requestId: string; model: string; cost: string | null }[] };
    let total = 0n;
    const seen = new Set<string>();
    const claimedCalls = new Set<string>();
    for (const record of rows) {
      if (seen.has(record.requestId)) { summary.duplicates++; continue; }
      seen.add(record.requestId);
      if (record.costNano === null) summary.missingCost++;
      const [existing] = await q("SELECT * FROM account_bills WHERE request_id=$1", [record.requestId]);
      const fillsMissingCost = existing && existing.cost_nano === null && record.costNano !== null;
      const resolved = existing ? reconcileRecord({ requestId: String(existing.request_id), model: String(existing.model), requestedModel: "", costNano: existing.cost_nano === null ? null : Number(existing.cost_nano), time: String(existing.billed_at), ua: String(existing.user_agent), status: String(existing.status) }, record) : record;
      if (!resolved) throw new AccountError("这份账单与已导入的同一请求记录内容不一致，已停止导入，请核对原始账单。");
      let callId = existing?.call_id || await matchCall(q, record);
      if(callId && claimedCalls.has(callId)) callId=null;
      if(callId) claimedCalls.add(callId);
      if (existing) {
        summary.duplicates++;
        if (fillsMissingCost) {
          summary.updatedCosts++;
          total += BigInt(record.costNano!);
          if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new AccountError("费用汇总超出可核算范围。");
          if (commit) await q("UPDATE account_bills SET cost_nano=$1,status=$2,imported_at=$3,import_id=$4,billed_at=$6 WHERE request_id=$5", [record.costNano,record.status,now,importId,record.requestId,record.time]);
        }
        // Advance only an unpriced failure's timestamp; never downgrade a paid
        // result or add a second bill when overlapping exports are imported.
        if (commit && existing.cost_nano === null && resolved.costNano === null && resolved.time !== String(existing.billed_at)) {
          await q("UPDATE account_bills SET billed_at=$1,imported_at=$2,import_id=$3 WHERE request_id=$4", [resolved.time,now,importId,record.requestId]);
        }
        if (!existing.call_id && callId) {
          summary.relinked++;
          if (commit) await q("UPDATE account_bills SET call_id=$1 WHERE request_id=$2", [callId, record.requestId]);
        }
        continue;
      }
      summary.added++;
      if (record.costNano !== null) total += BigInt(record.costNano);
      if (total > BigInt(Number.MAX_SAFE_INTEGER)) throw new AccountError("费用汇总超出可核算范围。");
      if (callId) summary.matched++;
      else {
        summary.unmatched++;
        if (summary.unmatchedExamples.length < 5) summary.unmatchedExamples.push({ requestId: record.requestId, model: record.model, cost: record.costNano === null ? null : nanoToCost(record.costNano) });
      }
      if (commit) await q("INSERT INTO account_bills(request_id,call_id,model,user_agent,billed_at,cost_nano,status,imported_at,import_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [record.requestId,callId,record.model,record.ua,record.time,record.costNano,record.status,now,importId]);
    }
    summary.addedCost = nanoToCost(total.toString());
    if (commit) await q("INSERT INTO account_imports(id,user_id,file_hash,filename,row_count,added_count,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)", [importId,userId,createHash("sha256").update(csv).digest("hex"),filename.slice(0,180),rows.length,summary.added,now]);
    return { ...summary, committed: commit };
  });
}
