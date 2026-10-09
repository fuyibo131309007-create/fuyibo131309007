import { buildReport } from "../../../lib/market/engine";
import { DataError, fetchBundle } from "../../../lib/market/providers";
import { explain } from "../../../lib/market/model";
import { isSameOrigin, isFuture, RequestError, readBody, reply, requestSchema, runtime } from "../../../lib/market/server";
import { snapshotFingerprint } from "../../../lib/market/fingerprint";
export async function POST(request:Request){
 if(!isSameOrigin(request))return reply({error:"不支持跨站请求。"},403);
 try{const parsed=requestSchema.safeParse(await readBody(request));if(!parsed.success)return reply({error:"研究参数无效，请检查指数、日期与窗口。",code:"INVALID_REQUEST"},400);
  const input=parsed.data;if(isFuture(input.asOf))return reply({error:"不能研究未来日期。",code:"FUTURE_DATE"},400);
  const config=runtime(),bundle=await fetchBundle(input,config),report=buildReport(input,bundle);report.model=await explain(report,config);
  report.traces.push({id:"interpretation",tool:report.model.status==="generated"?"DeepSeek证据解读":"规则解读",purpose:"整理已有事实、归纳与不确定性",status:report.model.status==="failed"?"failed":report.model.status==="generated"?"success":"skipped",durationMs:report.model.durationMs,message:report.model.reason});
  report.snapshotFingerprint=await snapshotFingerprint(report);return reply({report});
 }catch(error){if(error instanceof RequestError)return reply({error:error.message},error.status);if(error instanceof DataError)return reply({error:error.message,code:error.code,traces:error.traces},error.code==="MISSING_FUYAO_KEY"?503:502);return reply({error:"取数或数据核验未完成，已停止生成正常报告。请重试或切换官方历史回放。",code:"RESEARCH_FAILED"},502);}
}
