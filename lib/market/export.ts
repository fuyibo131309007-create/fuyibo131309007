import type { Insight, Report, ResearchFollowup } from "./types";

const insights=(items:Insight[])=>items.map(item=>`- ${item.kind==="inference"?"归纳":"不确定性"}：${item.text} [${item.evidenceIds.join(", ")}]`).join("\n")||"无";
export function reportMarkdown(report:Report,followups:ResearchFollowup[]=[]){
 return [
  `# ${report.indexName}市场复盘`,
  `请求截至：${report.request.asOf}；实际截至：${report.asOf}；窗口：${report.request.window}个交易日；模式：${report.modeLabel}`,
  `生成时间：${report.generatedAt}\n证据指纹：${report.snapshotFingerprint||"未生成"}`,
  `## 状态与证据支持度\n${report.regime}\n覆盖：${report.coverage.available}/${report.coverage.total}；支持度：${report.coverage.confidence}\n${report.coverage.explanation}`,
  `### 规则归纳\n${report.summary}`,
  `### 模型解读\n状态：${report.model.status}；模型：${report.model.provider} / ${report.model.model}\n${report.model.reason}\n${report.model.summary||"未生成，使用规则归纳。"}\n${insights(report.model.insights||[])}`,
  `## 支持证据\n${insights(report.supports)}`,
  `## 冲突与未决问题\n${insights(report.conflicts)}`,
  `## 事实与证据`,
  ...report.evidence.map(e=>`### [${e.id}] ${e.dimension} · ${e.displayValue}\n状态：${e.status}；单位：${e.unit||"不适用"}\n事实：${e.observation}\n解释：${e.interpretation}\n范围：${e.scope}；截至：${e.asOf}；采集时间：${e.retrievedAt||"未取得"}\n口径：${e.formula}\n来源：${e.source} ${e.sourceUrl}\n请求：${e.endpoint||"未接入"}\n限制：${e.caveat}\n\n原始字段与计算输入：\n\n\`\`\`json\n${JSON.stringify({rawFields:e.rawFields,inputs:e.inputs},null,2)}\n\`\`\``),
  `## 判断改变条件`,...report.conditions.map(c=>`- ${c.title}：${c.detail} [${c.evidenceIds.join(", ")}]`),
  `## 缺口与限制`,...report.limitations.map(l=>`- ${l}`),...report.warnings.map(l=>`- ${l}`),
  `## 取数执行记录`,...report.traces.map(t=>`- ${t.tool}：${t.status}；${t.durationMs} ms；${t.count??"—"}条\n  ${t.purpose}；${t.message}\n  ${t.endpoint||""}`),
  `## 继续研究`,...followups.map(f=>`### ${f.question}\n截至：${f.asOf}；模型状态：${f.model.status}\n${f.answer}\n${insights(f.insights)}\n${f.model.reason}`),
  "市场状态研究仅用于信息理解，不构成涨跌预测或投资建议。",
 ].join("\n\n");
}
export function reportJSON(report:Report,followups:ResearchFollowup[]=[]){return JSON.stringify({report,followups},null,2);}
