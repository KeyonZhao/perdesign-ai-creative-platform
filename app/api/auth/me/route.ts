import { getAccount, accountError } from "@/lib/accounts";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return Response.json({ user: await getAccount(request) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return accountError(error); }
}
