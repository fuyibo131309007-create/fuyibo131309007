import { INDICES, type ResearchRequest } from "./types";

// A deterministic research plan: it exposes intended work before any requests run.
export function researchPlan(request:ResearchRequest){
 const name=INDICES.find(i=>i.code===request.index)?.name||request.index;
 const source=request.mode==="fuyao"?"扶摇金融接口":request.mode==="official"?"上交所月报接口":"上交所公开历史缓存";
 return [
  `研究${name}，请求截至${request.asOf}，观察${request.window}个交易日。来源：${source}。`,
  request.mode==="fuyao"?"先查交易日历，排除未完成交易日；获取四指数历史日线并核验交易日连续性。":"读取四指数历史数据，核对实际有效日；月报延迟或缓存降级时保留提示。",
  `计算窗口收益需要${request.window+1}个收盘价；MA60另需至少60个交易日。比较同起止日的科创50与沪深300，核验结构、成交与已实现波动。`,
  request.mode==="fuyao"?"仅研究今日且收盘后尝试全A完整分页快照；历史日不混用当前宽度。估值、事件与情绪缺失时保留判断。":"只使用与实际截至日相同的沪市分板估值；历史全A宽度、事件与情绪未覆盖。",
  "按已验证证据形成状态与改变条件，再由模型解释；失败或不支持的断言回退规则解读。",
 ];
}
