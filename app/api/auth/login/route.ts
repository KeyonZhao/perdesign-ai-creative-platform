import { NextResponse } from "next/server";
import { login, SESSION_COOKIE, requireSameOrigin, accountError, AccountError } from "@/lib/accounts";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const data = await request.json();
    if (typeof data.username !== "string" || typeof data.password !== "string") throw new AccountError("请输入用户名和密码。");
    const { token, user } = await login(data.username.trim(), data.password, request.headers.get("x-forwarded-for")?.split(",")[0] || "local");
    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: 7 * 86400 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) { return accountError(error); }
}
