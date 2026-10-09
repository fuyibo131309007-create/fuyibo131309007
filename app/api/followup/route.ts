import { z } from "zod";
import { buildReport } from "../../../lib/market/engine";
import { DataError, fetchBundle } from "../../../lib/market/providers";
import { explain, ruleFollowup } from "../../../lib/market/model";
import { isSameOrigin, isFuture, RequestError, readBody, reply, requestSchema, runtime } from "../../../lib/market/server";
import { snapshotFingerprint } from "../../../lib/market/fingerprint";
export async function POST(request:Request){
 if(!isSameOrigin(request))return reply({error:"不支持跨站请求。"},403);
 try{const parsed=z.object({request:requestSchema,snapshotFingerprint:z.string().regex(/^[a-f0-9]{64}$/),question:z.string().trim().min(2).max(500)}).strict().safeParse(await readBody(request));if(!parsed.success)return reply({error:"研究参数无效或证据快照缺失，请重新生成复盘。"},400);
  if(isFuture(parsed.data.request.asOf))return reply({error:"不能研究未来日期。",code:"FUTURE_DATE"},400);
  const config=runtime(),bundle=await fetchBundle(parsed.data.request,config),report=buildReport(parsed.data.request,bundle);
  if(await snapshotFingerprint(report)!==parsed.data.snapshotFingerprint)return reply({error:"数据或覆盖范围已变化，请先重新生成复盘，再继续研究。",code:"SNAPSHOT_CHANGED"},409);
  const model=await explain(report,config,parsed.data.question),fallback=ruleFollowup(report,parsed.data.question);
  return reply({answer:model.status==="generated"?model.summary:fallback.answer,insights:model.status==="generated"?model.insights:fallback.insights,model,asOf:report.asOf});
 }catch(error){if(error instanceof RequestError)return reply({error:error.message},error.status);return reply({error:error instanceof DataError?error.message:"继续研究失败，请重试。"},502);}
}
