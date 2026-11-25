import { getAccount, accountError } from "@/lib/accounts";
import { emergencyMode } from "@/lib/emergency-access";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { return Response.json({ user: await getAccount(request), emergency: emergencyMode() }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return accountError(error); }
}
