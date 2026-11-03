import { requireAccount, requireSameOrigin, accountError, AccountError } from "@/lib/accounts";
import { importBilling } from "@/lib/billing-import";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    requireSameOrigin(request); const user = await requireAccount(request, true);
    if (Number(request.headers.get("content-length")) > 9 * 1024 * 1024) throw new AccountError("账单文件不能超过 8MB。");
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string" || file.size > 8 * 1024 * 1024) throw new AccountError("请选择不超过 8MB 的 CSV 文件。");
    return Response.json(await importBilling(await file.text(), file.name, user.id, form.get("commit") === "true"));
  } catch (error) { return accountError(error); }
}
