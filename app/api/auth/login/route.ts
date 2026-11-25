import { NextResponse } from "next/server";
import { login, sessionToken, SESSION_COOKIE, requireSameOrigin, accountError, AccountError } from "@/lib/accounts";
import { emergencyMode, emergencyLogin } from "@/lib/emergency-access";
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const data = await request.json();
    if (typeof data.username !== "string" || typeof data.password !== "string") throw new AccountError("请输入用户名和密码。");
    const result = emergencyMode()
      ? emergencyLogin(data.password,sessionToken(request))
      : await login(data.username.trim(), data.password, request.headers.get("x-forwarded-for")?.split(",")[0] || "local");
    if(!result)throw new AccountError("临时访问码不正确。",401);
    const { token, user } = result;
    const response = NextResponse.json({ user });
    response.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: 7 * 86400 });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) { return accountError(error); }
}
