import { loadEnvConfig } from "@next/env";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createAccount } from "../lib/accounts";
import { transaction } from "../lib/account-db";

async function main() {
  loadEnvConfig(process.cwd());
  const username=process.argv[2] || "admin";
  const displayName=process.argv[3] || "公司管理员";
  // Bootstrap is intentionally one-time. Subsequent users are managed in /admin.
  await transaction(async q=>{
    if((await q("SELECT id FROM account_users WHERE role='admin' AND active=1")).length) throw new Error("管理员已存在，请在后台管理账号。本命令不会重置现有密码。");
  });
  const password=randomBytes(18).toString("base64url");
  const folder=path.join(process.cwd(),".local-data");
  await mkdir(folder,{recursive:true,mode:0o700});
  const cloud=Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const destination=path.join(folder,`${cloud?"cloud-":""}admin-login-${Date.now()}.txt`);
  // Write recovery credentials before creating the account; never print passwords.
  await writeFile(destination,`品物平台${cloud?"云端":"本地"}管理员初始登录信息\n用户名：${username}\n密码：${password}\n入口：${cloud?"https://perdesign-ai-creative-platform.vercel.app":"http://localhost:3001"}/admin\n请妥善保管，不要提交到 Git。\n`,{mode:0o600,flag:"wx"});
  await createAccount(username,displayName,password,"admin");
  console.log(`管理员已创建。登录信息保存在：${destination}`);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1);});
