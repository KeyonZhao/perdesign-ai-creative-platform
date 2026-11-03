import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken, hashToken, requireSameOrigin, accountError } from "@/lib/accounts";
import { query } from "@/lib/account-db";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await query("DELETE FROM account_sessions WHERE token_hash=$1", [hashToken(sessionToken(request))]);
    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch (error) { return accountError(error); }
}
