import type { Bar, DataBundle, Evidence, ResearchRequest, Report, Series } from "./types";

export const mean = (values: number[]) => values.reduce((sum,v)=>sum+v,0)/values.length;
export const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const pct = (v: number | null, digits=2) => v === null ? "—" : `${v>0?"+":""}${v.toFixed(digits)}%`;
export const fixed = (v: number | null, digits=2) => v===null?"—":v.toLocaleString("zh-CN",{minimumFractionDigits:digits,maximumFractionDigits:digits});
export const dateOf = (ms:number) => new Date(ms+8*3600_000).toISOString().slice(0,10);

export function normalizeBars(bars: Bar[], end: string): Bar[] {
  const map=new Map<string,Bar>();
  for(const b of bars){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||b.date>end)continue;
    if(![b.close_price,b.open_price,b.high_price,b.low_price].every(v=>finite(v)&&v>0))throw new Error(`INVALID_OHLC:${b.date}`);
    if(b.high_price<Math.max(b.open_price,b.close_price)||b.low_price>Math.min(b.open_price,b.close_price)||b.low_price>b.high_price)throw new Error(`CONFLICT_OHLC:${b.date}`);
    const previous=map.get(b.date);
    if(previous && ["close_price","open_price","high_price","low_price","turnover","volume"].some(k=>previous[k as keyof Bar]!==b[k as keyof Bar]))throw new Error(`CONFLICT_DUPLICATE:${b.date}`);
    map.set(b.date,b);
  }
  return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function trailingMean(bars:Bar[],n:number,field:"close_price"|"turnover"){
  const values=bars.slice(-n).map(b=>b[field]);
  return values.length===n&&values.every(v=>finite(v)&&(field!=="turnover"||v>=0))?mean(values as number[]):null;
}
export function windowReturn(bars:Bar[],n:number){return bars.length>=n+1?(bars.at(-1)!.close_price/bars.at(-n-1)!.close_price-1)*100:null;}
export function realizedVolatility(bars:Bar[],n=20){
  if(bars.length<n+1)return null;
  const b=bars.slice(-n-1);const r=b.slice(1).map((v,i)=>(v.close_price/b[i].close_price-1)*100);const m=mean(r);
  return Math.sqrt(r.reduce((s,v)=>s+(v-m)**2,0)/(n-1));
}
export function maximumDrawdown(bars:Bar[]){
  if(bars.length<2)return null;let peak=bars[0].close_price,drawdown=0;
  for(const b of bars){peak=Math.max(peak,b.close_price);drawdown=Math.min(drawdown,(b.close_price/peak-1)*100);}return drawdown;
}
export function breadthRatio(up:number,down:number){return up+down>0?up/(up+down)*100:null;}

export function buildReport(request:ResearchRequest,bundle:DataBundle):Report{
  const selected=bundle.series.find(s=>s.code===request.index);
  if(!selected)throw new Error("NO_SELECTED_INDEX");
  const bars=normalizeBars(selected.bars,bundle.resolvedDate);
  if(!bars.length)throw new Error("NO_HISTORY");
  const last=bars.at(-1)!,asOf=last.date;
  const ma20=trailingMean(bars,20,"close_price"),ma60=trailingMean(bars,60,"close_price");
  const avg5=trailingMean(bars,5,"turnover"),avg20=trailingMean(bars,20,"turnover");
  const activityRatio=avg5!==null&&avg20!==null&&avg20>0?avg5/avg20:null;
  const windowBars=bars.slice(-request.window-1),ret=windowReturn(bars,request.window),vol=realizedVolatility(bars),drawdown=bars.length>=request.window+1?maximumDrawdown(windowBars):null;
  const structure=ma20===null||ma60===null?"unknown":last.close_price>ma20&&last.close_price>ma60?"up":last.close_price<ma20&&last.close_price<ma60?"down":"mixed";
  const structureText={up:"指数上行结构",down:"指数下行结构",mixed:"指数结构分化",unknown:"结构证据不足"}[structure];
  const evidence:Evidence[]=[];
  function missing(id:string,dimension:string,label:string,reason:string,scope="未覆盖"){
    evidence.push({id,dimension,label,status:"missing",value:null,displayValue:"未覆盖",unit:"",observation:reason,interpretation:"该维度不参与本次判断。",formula:"不可计算",scope,asOf,source:"未接入",sourceUrl:"",endpoint:"",retrievedAt:"",rawFields:{},inputs:null,caveat:reason});
  }
  function add(id:string,dimension:string,label:string,value:number,displayValue:string,unit:string,observation:string,interpretation:string,formula:string,inputs:unknown,caveat:string,series:Series=selected!){
    evidence.push({id,dimension,label,status:"available",value,displayValue,unit,observation,interpretation,formula,inputs,caveat,scope:series.name,asOf,source:series.source,sourceUrl:series.sourceUrl,endpoint:series.endpoint,retrievedAt:series.retrievedAt,rawFields:series.rawFields});
  }
  if(ma20!==null&&ma60!==null)add("structure","指数结构","收盘价与均线",last.close_price,fixed(last.close_price),"点",`${selected.name}收盘 ${fixed(last.close_price)} 点；MA20 ${fixed(ma20)}，MA60 ${fixed(ma60)}。`,structureText,"MA20/MA60 = 截至日最近20/60个交易日收盘价的算术平均。",{close:last.close_price,ma20,ma60,rows:bars.slice(-60).map(b=>({date:b.date,close_price:b.close_price}))},"均线是历史价格描述，不代表未来涨跌。");else missing("structure","指数结构","收盘价与均线",`有效历史仅${bars.length}日，计算MA60需要至少60个交易日。`,selected.name);
  if(activityRatio!==null)add("activity","交易活跃度","成交活跃度",activityRatio,`${activityRatio.toFixed(2)}×`,"倍",`近5日平均成交额 / 近20日平均成交额 = ${activityRatio.toFixed(2)}倍。`,activityRatio>=1.2?"成交活跃度放大":activityRatio<=.8?"成交活跃度收缩":"成交活跃度相对平稳","近5日平均成交额÷近20日平均成交额；阈值1.2/0.8为产品启发式规则。",{average5:avg5,average20:avg20,rows:bars.slice(-20).map(b=>({date:b.date,turnover:b.turnover}))},"仅所选指数样本口径，不是全A成交额，也不代表资金净流入。");else missing("activity","交易活跃度","成交活跃度","成交额数据缺失、历史不足20日或分母为零。",selected.name);
  const csi=bundle.series.find(s=>s.code==="000300.SH"),star=bundle.series.find(s=>s.code==="000688.SH");
  const firstDate=bars.at(-request.window-1)?.date;
  function alignedReturn(s:Series|undefined){if(!s||!firstDate)return null;const b=normalizeBars(s.bars,asOf);const end=b.find(v=>v.date===asOf),start=b.find(v=>v.date===firstDate);return start&&end?(end.close_price/start.close_price-1)*100:null;}
  const csiRet=alignedReturn(csi),starRet=alignedReturn(star),styleGap=csiRet!==null&&starRet!==null?starRet-csiRet:null;
  if(styleGap!==null){add("style","风格代理","科创相对大盘",styleGap,`${styleGap>0?"+":""}${styleGap.toFixed(2)} 个百分点`,"个百分点",`相同起止日，科创50 ${pct(starRet)}，沪深300 ${pct(csiRet)}，收益差 ${styleGap>0?"+":""}${styleGap.toFixed(2)} 个百分点。`,styleGap>=1?"科创50相对沪深300占优":styleGap<=-1?"沪深300相对科创50占优":"两类指数表现接近","科创50区间收益率－沪深300区间收益率；均使用相同起止日收盘价。",{from:firstDate,to:asOf,csiReturnPct:csiRet,starReturnPct:starRet,csiRows:csi!.bars.filter(b=>b.date===firstDate||b.date===asOf),starRows:star!.bars.filter(b=>b.date===firstDate||b.date===asOf)},"只比较两个指数，不等同于全市场大小盘风格，也不代表全部科技行业。",star);evidence.at(-1)!.scope="科创50 / 沪深300";evidence.at(-1)!.endpoint=`${star!.endpoint} ; ${csi!.endpoint}`;}else missing("style","风格代理","科创相对大盘","比较指数缺失、观察窗口历史不足，或相同起止日无法对齐。","科创50 / 沪深300");
  if(vol!==null)add("volatility","已实现波动","日收益波动",vol,`${vol.toFixed(2)}%`,"% / 日",`近20个交易日日收益率的样本标准差为 ${vol.toFixed(2)}%。`,"描述已经发生的日间价格波动","20个收盘到收盘日收益率的样本标准差（分母n−1）；不年化。",{std:vol,rows:bars.slice(-21).map(b=>({date:b.date,close_price:b.close_price}))},"未建立长期样本分位，不能据此标记历史高低或预测未来波动。");else missing("volatility","已实现波动","日收益波动","历史不足21个收盘价，不能计算20个日收益率。",selected.name);
  const market=bundle.markets.find(m=>m.id===(request.index==="000688.SH"?"star":"main"));const mr=market?.bars.find(b=>b.date===asOf);
  if(market&&mr&&finite(mr.average_pe)&&mr.average_pe>0){add("valuation","估值背景",`${market.name}市盈率`,mr.average_pe,`${mr.average_pe.toFixed(2)}×`,"倍",`${market.name}平均市盈率为 ${mr.average_pe.toFixed(2)}倍。`,"仅作为沪市分板的估值背景","上交所月报平均市盈率口径：总市值/总收益（上一年度每股收益口径）。不计算历史分位。",{date:mr.date,AVG_PE:mr.average_pe},"不是所选指数PE，不是TTM，也不是全A估值；不可将两板市盈率算术平均。");Object.assign(evidence.at(-1)!,{scope:market.name,source:"上海证券交易所·统计月报",sourceUrl:market.sourceUrl,endpoint:market.endpoint,retrievedAt:market.retrievedAt,rawFields:{date:"MDATE",average_pe:"AVG_PE"}});}else missing("valuation","估值背景","沪市分板估值","缺少与截至日一致的沪市分板估值；未使用旧时点补齐。","沪市分板（非指数PE）");
  const breadth=bundle.breadth;const breadthValid=breadth&&breadth.date===asOf&&breadth.fetched===breadth.total&&breadth.total>0&&(breadth.up+breadth.down+breadth.flat)/breadth.total>=.9&&breadth.ratio!==null;
  if(breadthValid){add("breadth","市场宽度","上涨家数占比",breadth.ratio!,`${breadth.ratio!.toFixed(1)}%`,"%",`上涨${breadth.up}家、下跌${breadth.down}家、平盘${breadth.flat}家、排除${breadth.excluded}家。`,breadth.ratio!>=60?"上涨参与扩散":breadth.ratio!<=40?"上涨参与收缩":"上涨参与均衡","上涨家数÷(上涨家数+下跌家数)；平盘、缺失价格和无成交证券不计入分母。",breadth,"只使用完整分页、与研究日一致且收盘后的市场快照。");Object.assign(evidence.at(-1)!,{scope:"全A快照",source:"扶摇金融数据",sourceUrl:"https://fuyao.aicubes.cn/docs/api-reference/prices/",endpoint:breadth.endpoint,retrievedAt:breadth.retrievedAt,rawFields:{change:"price_change_ratio_pct",volume:"volume",price:"last_price"}});}else missing("breadth","市场宽度","上涨家数占比","未取得与截至日一致的完整市场快照，不能判断行情是否广泛扩散。","全A");
  missing("events","事件与情绪","事件交叉验证","公告、新闻、宏观与情绪数据尚未接入；未检索不等于没有重要事件。","事件 / 宏观 / 情绪");
  const available=evidence.filter(e=>e.status==="available").length;
  const summary=structure==="unknown"?"指数历史不足，暂不形成完整结构判断。":`${structureText}。${breadthValid?breadth!.ratio!>=60?"同日上涨参与扩散。":breadth!.ratio!<=40?"同日上涨参与收缩，需与指数结构交叉核验。":"同日上涨参与均衡。":"尚缺同日市场宽度，暂不能把指数表现外推为全市场趋势。"}`;
  const supports:Report["supports"]=[];const conflicts:Report["conflicts"]=[];
  if(ma20!==null&&ma60!==null)supports.push({kind:"inference",text:structure==="up"?"收盘价同时高于短期与中期均线，历史价格呈上行结构。":structure==="down"?"收盘价同时低于短期与中期均线，历史价格呈下行结构。":"价格位于两条均线之间，短期与中期信号尚未一致。",evidenceIds:["structure"]});
  if(activityRatio!==null)(structure==="up"&&activityRatio<=.8?conflicts:supports).push({kind:"inference",text:activityRatio>=1.2?"近期成交活跃度放大，为价格变化提供交易活跃度背景。":activityRatio<=.8?"近期成交活跃度收缩，价格表现的交易参与基础需要继续核验。":"成交活跃度相对平稳，尚未出现规则定义下的明显放大或收缩。",evidenceIds:["activity"]});
  if(styleGap!==null)conflicts.push({kind:"uncertainty",text:Math.abs(styleGap)>=1?"两类指数区间表现存在差异，单一指数难以代表全部市场。":"两个指数表现接近，但这一对比仍不能替代全市场宽度。",evidenceIds:["style"]});
  if(!breadthValid)conflicts.push({kind:"uncertainty",text:"指数结构与全市场参与程度是两个问题，当前证据只能回答前者。",evidenceIds:["structure","breadth"]});
  if(breadthValid){const conflict=(structure==="up"&&breadth!.ratio!<=40)||(structure==="down"&&breadth!.ratio!>=60);(conflict?conflicts:supports).push({kind:conflict?"uncertainty":"inference",text:conflict?"指数结构与上涨参与程度方向不一致，整体市场呈现分化，不能只依据指数形成方向性归纳。":breadth!.ratio!>=60?"同日上涨参与扩散，为指数结构提供市场宽度背景。":breadth!.ratio!<=40?"同日上涨参与收缩，需要区分指数与参与范围。":"同日上涨参与较为均衡，尚未达到扩散或收缩阈值。",evidenceIds:["structure","breadth"]});}
  const conditions:Report["conditions"]=[{title:"价格结构改变",detail:ma20!==null&&ma60!==null?`收盘价与MA20（${fixed(ma20)}点）、MA60（${fixed(ma60)}点）的相对位置变化时，重新计算结构标签；均线随新数据更新。`:"补齐至少60个交易日的有效收盘价后，重新评估结构。",evidenceIds:["structure"]},{title:"交易参与发生变化",detail:"成交活跃度跨过1.2倍或0.8倍阈值时，重新解释交易活跃程度；这不代表资金净流入或流出。",evidenceIds:["activity"]},{title:"市场宽度得到核验",detail:"取得同日完整市场宽度后，核验上涨占比是否达到60%或低于40%；缺失期间保留整体市场判断。",evidenceIds:["breadth"]}];
  const limitations=evidence.filter(e=>e.status==="missing").map(e=>e.observation);
  if(asOf!==bundle.resolvedDate)limitations.push(`请求截至${bundle.resolvedDate}，实际最近有效数据为${asOf}，未以旧数据冒充请求日。`);
  if(request.mode!=="fuyao")limitations.push("当前为历史回放，只解释截至样本日已经发生的状态，不代表当前市场。");
  if(bars.length<request.window+1)limitations.push(`观察窗口需要${request.window+1}个收盘价，当前仅${bars.length}个；区间收益与回撤不计算。`);
  const coreMissing=structure==="unknown",stale=asOf!==bundle.resolvedDate;
  const confidence=coreMissing||stale?"低":available>=6?"高":available>=3?"中":"低";
  return {id:crypto.randomUUID(),request,indexName:selected.name,asOf,generatedAt:new Date().toISOString(),modeLabel:request.mode==="fuyao"?"扶摇接口研究":request.mode==="official"?"官方历史取数":"官方历史缓存回放",bars:windowBars,series:bundle.series.map(s=>({code:s.code,name:s.name,returnPct:alignedReturn(s)})),evidence,traces:bundle.traces,warnings:bundle.warnings,regime:structureText,structure,summary,supports,conflicts,conditions,limitations,coverage:{available,total:evidence.length,confidence,explanation:`${available}/${evidence.length}个研究维度可计算。${coreMissing?"核心均线历史不足，支持度降为低。":stale?"实际行情早于目标交易日，支持度降为低。":""}支持度衡量覆盖与口径，不是上涨概率；缺失维度不参与判断。`},model:{status:"unconfigured",provider:"DeepSeek",model:"",reason:"模型尚未配置，当前展示可复算的规则解读。",durationMs:0},metrics:{close:last.close_price,dailyReturn:windowReturn(bars,1),windowReturn:ret,ma20,ma60,activityRatio,volatility:vol,maxDrawdown:drawdown,styleGap}};
}
