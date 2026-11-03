import { z } from "zod";
import { AccountError, accountError, registerAccount, requireSameOrigin } from "@/lib/accounts";

const registration=z.object({username:z.string().trim().min(3).max(40),displayName:z.string().trim().min(1).max(60),password:z.string().min(8).max(128)}).strict();

export async function POST(request:Request) {
  try {
    requireSameOrigin(request);
    // Bound the public request body before parsing or hashing passwords.
    const reader=request.body?.getReader();
    if(!reader)throw new AccountError("请填写姓名、用户名和密码。");
    const chunks:Uint8Array[]=[];let size=0;
    try {
      while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();throw new AccountError("注册信息过长。",413);}chunks.push(value);}
    } finally {reader.releaseLock();}
    let body:unknown;
    try{body=JSON.parse(Buffer.concat(chunks).toString("utf8"));}catch{throw new AccountError("注册信息格式无效。");}
    const parsed=registration.safeParse(body);
    if(!parsed.success)throw new AccountError("请填写姓名（1–60 字）、用户名（3–40 位）和密码（8–128 位）。");
    const {username,displayName,password}=parsed.data;
    await registerAccount(username,displayName,password,request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"local");
    return Response.json({ok:true,message:"注册申请已提交，请等待管理员批准。批准后使用用户名和密码登录。"},{status:201,headers:{"Cache-Control":"no-store"}});
  } catch(error){return accountError(error);}
}
