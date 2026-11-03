import { query } from "@/lib/account-db";
import { requireAccount, accountError, AccountError } from "@/lib/accounts";
import { readCallImage } from "@/lib/call-media";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user=await requireAccount(request);
    const id=new URL(request.url).searchParams.get("id")||"";
    const [media]=await query("SELECT * FROM account_media WHERE id=$1",[id]);
    if(!media || (user.role!=="admin" && media.user_id!==user.id)) throw new AccountError("图片不存在或无权访问。",404);
    return new Response(await readCallImage(media as {location:string;storage:string}), {headers:{"Content-Type":media.mime,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  } catch(error) { return accountError(error); }
}
