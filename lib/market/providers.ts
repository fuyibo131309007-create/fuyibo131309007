import archive from "../../data/official/official-replay.json";
import marketArchive from "../../data/official/official-market-replay.json";
import { dateOf, finite, normalizeBars } from "./engine";
import { INDICES, type Bar, type Breadth, type DataBundle, type MarketSeries, type ResearchRequest, type Series, type Trace } from "./types";

export type RuntimeConfig={ FUYAO_API_KEY?:string; DEEPSEEK_API_KEY?:string; DEEPSEEK_BASE_URL?:string; DEEPSEEK_MODEL?:string };
const SSE_PAGE="https://www.sse.com.cn/aboutus/publication/monthly/index/";
const SSE_MARKET="https://www.sse.com.cn/aboutus/publication/monthly/report/";
const SSE_BASE="https://query.sse.com.cn/commonQuery.do";
const FUYAO="https://fuyao.aicubes.cn";
const CACHE_ASOF="2026-08-31";
const sseFields={date:"MDATE",open_price:"OPEN",high_price:"HIGH",low_price:"LOW",close_price:"CLS",volume:"TRD_VOL × 1e8（原单位亿股）",turnover:"TRD_VAL × 1e8（原单位亿元）"};
const fuyaoFields={date:"date_ms（Asia/Shanghai）",open_price:"open_price",high_price:"high_price",low_price:"low_price",close_price:"close_price",volume:"volume（股）",turnover:"turnover（元）"};
export class DataError extends Error{constructor(public code:string,message:string,public traces:Trace[]=[]){super(message);}}
export function completedCutoff(now=new Date()){
 const today=dateOf(now.getTime()),local=new Date(now.getTime()+8*3600_000),closed=local.getUTCHours()*60+local.getUTCMinutes()>=15*60+30;
 return {today,closed,cutoff:closed?today:dateOf(now.getTime()-86400_000)};
}
export function isClosedSnapshot(timestamp:unknown,date:string,now:number){
 if(!finite(timestamp)||timestamp<=0||timestamp>now||dateOf(timestamp)!==date)return false;
 const local=new Date(timestamp+8*3600_000);return local.getUTCHours()*60+local.getUTCMinutes()>=15*60;
}
export function normalizeFuyaoBar(b:Record<string,unknown>,start:number,end:number):Bar{
 const ms=b.date_ms;if(!finite(ms)||ms<start||ms>end)throw new DataError("INVALID_TIMESTAMP","指数日线时间字段缺失或超出请求范围。");
 return {date:dateOf(ms),date_ms:ms,open_price:number(b.open_price)!,high_price:number(b.high_price)!,low_price:number(b.low_price)!,close_price:number(b.close_price)!,volume:number(b.volume),turnover:number(b.turnover)};
}
function number(value:unknown){if(value===null||value===undefined||value===""||value==="—"||value==="--")return null;const n=Number(String(value).replaceAll(",",""));return Number.isFinite(n)?n:null;}
function monthList(end:string){const [year,month]=end.split("-").map(Number);return Array.from({length:4},(_,i)=>{const d=new Date(Date.UTC(year,month-1-i,1));return d.toISOString().slice(0,7).replace("-","");}).reverse();}
function sseURL(sql:string,month:string){return `${SSE_BASE}?sqlId=${sql}&isPagination=false&MDATE=${month}`;}
async function pool<T,R>(items:T[],limit:number,fn:(v:T)=>Promise<R>):Promise<R[]>{
 let cursor=0;const results:R[]=[];
 const settled=await Promise.allSettled(Array.from({length:Math.min(limit,items.length)},async()=>{for(;;){const i=cursor++;if(i>=items.length)return;results[i]=await fn(items[i]);}}));
 // Finish in-flight requests before callers freeze the report and its trace.
 const failed=settled.find((result):result is PromiseRejectedResult=>result.status==="rejected");
 if(failed)throw failed.reason;return results;
}
async function jsonFetch(url:string,headers:Record<string,string>,timeout=12_000){
 const response=await fetch(url,{headers,signal:AbortSignal.timeout(timeout)});
 if(!response.ok)throw new DataError(`HTTP_${response.status}`,response.status===429?"接口限流，请稍后重试。":`数据接口返回HTTP ${response.status}。`);
 return await response.json() as Record<string,unknown>;
}
function traced(traces:Trace[],id:string,tool:string,purpose:string,endpoint:string,fn:()=>Promise<unknown>){
 return async()=>{const start=Date.now();try{const data=await fn();const count=Array.isArray(data)?data.length:undefined;traces.push({id,tool,purpose,endpoint,status:"success",durationMs:Date.now()-start,count,message:count===undefined?"取数成功":`返回${count}条记录`});return data;}catch(e){const message=e instanceof DataError?e.message:e instanceof Error&&e.name==="TimeoutError"?"数据接口超时。":"数据接口调用失败。";traces.push({id,tool,purpose,endpoint,status:"failed",durationMs:Date.now()-start,message});throw e;}};
}
export function replayBundle(request:ResearchRequest):DataBundle{
 if(request.asOf>CACHE_ASOF)throw new DataError("REPLAY_DATE_OUT_OF_RANGE",`历史缓存截至${CACHE_ASOF}，请选择样本日期或切换扶摇接口。`);
 const series:Series[]=archive.indices.map(s=>({code:s.thscode,name:s.name,bars:s.bars as Bar[],source:archive.source_name,sourceUrl:archive.source_url,endpoint:s.raw_sources.map(x=>x.url).join(" ; "),retrievedAt:archive.retrieved_at,origin:"archive",rawFields:sseFields}));
 const markets:MarketSeries[]=marketArchive.markets.map(s=>({id:s.id,name:s.name,bars:s.bars,sourceUrl:marketArchive.source_url,endpoint:s.raw_sources.map(x=>x.url).join(" ; "),retrievedAt:marketArchive.retrieved_at,origin:"archive"}));
 const dates=series[0].bars.filter(b=>b.date<=request.asOf);if(!dates.length)throw new DataError("REPLAY_DATE_OUT_OF_RANGE","历史缓存范围为2026-06-01至2026-08-31。此日期无样本。");
 const resolvedDate=dates.at(-1)!.date;
 return {series,markets,mode:"replay",requestedDate:request.asOf,resolvedDate,warnings:[`正在回放截至${resolvedDate}的官方历史缓存，采集于${archive.retrieved_at.slice(0,10)}；不代表当前市场。`],traces:[{id:"archive-index",tool:"读取官方指数历史缓存",purpose:"价格结构、风格代理、成交活跃度与波动",status:"cached",durationMs:0,count:series.reduce((s,v)=>s+v.bars.length,0),message:"真实官方响应缓存；原始响应与校验值随源码保存。",endpoint:archive.source_url},{id:"archive-market",tool:"读取官方沪市分板缓存",purpose:"核验同日分板估值背景",status:"cached",durationMs:0,count:markets.reduce((s,v)=>s+v.bars.length,0),message:"仅沪市主板、科创板；不代表全A。",endpoint:marketArchive.source_url}]};
}
export async function officialBundle(request:ResearchRequest):Promise<DataBundle>{
 const traces:Trace[]=[],warnings:string[]=[],months=monthList(request.asOf),retrievedAt=new Date().toISOString();
 const series=await pool([...INDICES],3,async(index):Promise<Series|null>=>{
  const endpoints=months.map(m=>sseURL(`COMMON_SSE_ZQZS_M_${index.sql}_INDEX_C`,m));
  try{const groups=await pool(endpoints,2,async(endpoint)=>await traced(traces,`${index.code}-${endpoint.slice(-6)}`,`上交所月报 · ${index.name}`,"读取指数日线",endpoint,async()=>{const d=await jsonFetch(endpoint,{Referer:SSE_PAGE});if(!Array.isArray(d.result))throw new DataError("INVALID_RESPONSE","官方接口返回结构异常。");return d.result;})() as Record<string,unknown>[]);
   const bars=groups.flat().map(row=>{const raw=String(row.MDATE);const date=`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;return {date,date_ms:Date.parse(date+"T00:00:00+08:00"),open_price:number(row.OPEN)!,high_price:number(row.HIGH)!,low_price:number(row.LOW)!,close_price:number(row.CLS)!,volume:number(row.TRD_VOL)===null?null:number(row.TRD_VOL)!*1e8,turnover:number(row.TRD_VAL)===null?null:number(row.TRD_VAL)!*1e8};});
   if(!bars.length)throw new DataError("EMPTY_HISTORY","官方月报没有返回该区间的指数数据。");
   return {code:index.code,name:index.name,bars:normalizeBars(bars,request.asOf),source:"上海证券交易所·统计月报",sourceUrl:SSE_PAGE,endpoint:endpoints.join(" ; "),retrievedAt,origin:"network",rawFields:sseFields};
  }catch{try{const cache=replayBundle({...request,asOf:request.asOf>CACHE_ASOF?CACHE_ASOF:request.asOf});const hit=cache.series.find(s=>s.code===index.code)!;warnings.push(`${index.name}官方取数未完整成功，已显式使用截至${CACHE_ASOF}的历史缓存。`);traces.push({id:`fallback-${index.code}`,tool:`${index.name}历史缓存`,purpose:"显式降级",status:"cached",durationMs:0,count:hit.bars.length,message:`官方取数失败；缓存仅截至${CACHE_ASOF}。`});return hit;}catch{return null;}}
 });
 const markets=await pool(["main","star"],2,async(id):Promise<MarketSeries|null>=>{
  const name=id==="main"?"沪市主板":"科创板",sql=id==="main"?"MAIN":"KCB",endpoint=sseURL(`COMMON_SSE_ZQJY_D_${sql}_TRADE_C`,request.asOf.slice(0,7).replace("-",""));
  try{const rows=await traced(traces,`market-${id}`,`上交所月报 · ${name}`,"读取同日估值背景",endpoint,async()=>{const d=await jsonFetch(endpoint,{Referer:SSE_MARKET});if(!Array.isArray(d.result)||!d.result.length)throw new DataError("EMPTY_MARKET","官方分板数据暂无记录。");return d.result;})() as Record<string,unknown>[];
   return {id,name,bars:rows.map(row=>{const raw=String(row.MDATE);return {date:`${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`,turnover:number(row.TRD_VAL)===null?null:number(row.TRD_VAL)!*1e8,average_pe:number(row.AVG_PE),turnover_ratio_pct:number(row.TO_RATE),listed_count:number(row.LST_VOL)};}),sourceUrl:SSE_MARKET,endpoint,retrievedAt,origin:"network"};
  }catch{const hit=replayBundle({...request,asOf:CACHE_ASOF}).markets.find(s=>s.id===id)!;warnings.push(`${name}官方取数失败，保留历史缓存并按截至日核验；不跨时点补齐。`);return hit;}
 });
 const validSeries=series.filter((s):s is Series=>s!==null);const selected=validSeries.find(s=>s.code===request.index);const last=selected?.bars.filter(b=>b.date<=request.asOf).at(-1);
 if(!last)throw new DataError("NO_SELECTED_INDEX","所选指数取数失败，无法生成报告。",traces);
 if(last.date!==request.asOf)warnings.push(`官方月报存在发布延迟：请求${request.asOf}，最近有效数据${last.date}。本次只研究实际有效日期。`);
 return {series:validSeries,markets:markets.filter((s):s is MarketSeries=>s!==null),mode:"official",requestedDate:request.asOf,resolvedDate:last.date,warnings,traces};
}
async function fuyao(path:string,key:string){const d=await jsonFetch(FUYAO+path,{"X-api-key":key});if(d.code!==0)throw new DataError(`FUYAO_${String(d.code)}`,`扶摇接口未成功（业务码${String(d.code)}）。请检查密钥、权限或参数。`);if(!d.data||typeof d.data!=="object")throw new DataError("INVALID_RESPONSE","扶摇返回数据结构异常。");return d.data as {timestamp:number;item:Record<string,unknown>[];total?:number};}
export async function calendar(key:string){const d=await fuyao("/api/a-share/calendar/trading-days",key);if(!Array.isArray(d.item))throw new DataError("INVALID_CALENDAR","交易日历结构异常。");return [...new Set(d.item.map(x=>String(x.date)).filter(x=>/^\d{8}$/.test(x)).map(x=>`${x.slice(0,4)}-${x.slice(4,6)}-${x.slice(6,8)}`))].sort();}
export async function fuyaoBundle(request:ResearchRequest,config:RuntimeConfig):Promise<DataBundle>{
 const key=config.FUYAO_API_KEY?.trim();if(!key)throw new DataError("MISSING_FUYAO_KEY","尚未配置扶摇密钥。可先使用官方历史回放。");
 const traces:Trace[]=[],warnings:string[]=[],now=new Date(),cutoff=completedCutoff(now);
 const dates=await traced(traces,"calendar","扶摇 · 交易日历","确定已完成交易日","/api/a-share/calendar/trading-days",()=>calendar(key))() as string[];
 const resolvedDate=dates.filter(d=>d<=request.asOf&&d<=cutoff.cutoff).at(-1);if(!resolvedDate)throw new DataError("NO_TRADING_DAY","请求区间没有可用的已完成交易日。",traces);
 if(resolvedDate!==request.asOf)warnings.push(`请求${request.asOf}，采用最近已完成交易日${resolvedDate}；非交易日或尚未收盘的日线不纳入研究。`);
 const end=Date.parse(resolvedDate+"T23:59:59+08:00"),start=end-210*86400_000,retrievedAt=new Date().toISOString();
 const series=await pool([...INDICES],3,async(index):Promise<Series|null>=>{
  const endpoint=`/api/a-share-index/prices/historical?thscode=${index.code}&interval=1d&start=${start}&end=${end}`;
  try{const rows=await traced(traces,index.code,`扶摇 · ${index.name}历史日线`,"读取足够历史计算均线与区间指标",endpoint,async()=>{const d=await fuyao(endpoint,key);if(!Array.isArray(d.item)||!d.item.length)throw new DataError("EMPTY_HISTORY","指数日线为空。");return d.item;})() as Record<string,unknown>[];
   const bars=rows.map(b=>normalizeFuyaoBar(b,start,end));
   const normalized=normalizeBars(bars,resolvedDate);const actual=normalized.at(-1)?.date;if(actual!==resolvedDate)warnings.push(`${index.name}最新日线为${actual??"无数据"}，与研究截至日不一致。`);
   return {code:index.code,name:index.name,bars:normalized,source:"扶摇金融数据",sourceUrl:"https://fuyao.aicubes.cn/docs/api-reference/a-share-index/",endpoint:FUYAO+endpoint,retrievedAt,origin:"network",rawFields:fuyaoFields};
  }catch{warnings.push(`${index.name}历史取数失败，关联指标将显示缺失。`);return null;}
 });
 let breadth:Breadth|undefined;
 if(resolvedDate===cutoff.today&&cutoff.closed){
  const startTime=Date.now();try{
   const pageSize=1000,first=await fuyao(`/api/a-share/prices/snapshot?limit=${pageSize}&offset=0`,key);const total=first.total;
   if(!Number.isInteger(total)||!total||total>12_000||!Array.isArray(first.item)||!first.item.length)throw new DataError("INVALID_BREADTH","市场快照总量异常。");
   const offsets=Array.from({length:Math.ceil(total/pageSize)-1},(_,i)=>(i+1)*pageSize);
   const pages=await pool(offsets,3,offset=>fuyao(`/api/a-share/prices/snapshot?limit=${pageSize}&offset=${offset}`,key));const all=[first,...pages];
   if(all.some(p=>p.total!==total||!isClosedSnapshot(p.timestamp,resolvedDate,now.getTime()))||Math.max(...all.map(p=>p.timestamp))-Math.min(...all.map(p=>p.timestamp))>60_000)throw new DataError("MISMATCHED_BREADTH","市场分页总量或数据时点不一致。");
   const rows=all.flatMap(p=>p.item),codes=new Set(rows.map(x=>x.thscode));if(codes.size!==total||rows.length!==total)throw new DataError("INCOMPLETE_BREADTH","市场快照分页不完整或包含重复证券。");
   let up=0,down=0,flat=0,excluded=0;for(const r of rows){const change=number(r.price_change_ratio_pct),price=number(r.last_price),volume=number(r.volume);if(change===null||price===null||price<=0||volume===null||volume<=0){excluded++;continue;}if(change>0)up++;else if(change<0)down++;else flat++;}
   if((up+down+flat)/total<.9)throw new DataError("LOW_VALID_COVERAGE","有效行情覆盖低于90%，不形成全市场宽度判断。");
   breadth={date:resolvedDate,timestamp:first.timestamp,up,down,flat,excluded,total,fetched:rows.length,ratio:up+down?up/(up+down)*100:null,endpoint:FUYAO+`/api/a-share/prices/snapshot?limit=${pageSize}&offset=0…${offsets.at(-1)??0}`,retrievedAt};
   traces.push({id:"breadth",tool:"扶摇 · 全A分页快照",purpose:"计算同日市场宽度",status:"success",durationMs:Date.now()-startTime,count:rows.length,message:`完整覆盖${rows.length}/${total}条，排除${excluded}条。`});
  }catch{warnings.push("完整同日市场宽度取数失败，不以部分分页生成全市场结论。");traces.push({id:"breadth",tool:"扶摇 · 全A分页快照",purpose:"计算同日市场宽度",status:"failed",durationMs:Date.now()-startTime,message:"取数失败或完整性/时点核验未通过。"});}
 }else traces.push({id:"breadth",tool:"扶摇 · 全A快照",purpose:"同日市场宽度",status:"skipped",durationMs:0,message:"快照仅提供当前状态；本次研究历史已完成交易日，不混用当前快照。"});
 const validSeries=series.filter((s):s is Series=>s!==null);if(!validSeries.find(s=>s.code===request.index)?.bars.length)throw new DataError("NO_SELECTED_INDEX","所选指数历史日线不可用，已停止生成报告。",traces);
 return {series:validSeries,markets:[],breadth,traces,warnings,mode:"fuyao",requestedDate:request.asOf,resolvedDate};
}
export async function fetchBundle(request:ResearchRequest,config:RuntimeConfig){if(request.mode==="replay")return replayBundle(request);if(request.mode==="official")return officialBundle(request);return fuyaoBundle(request,config);}
