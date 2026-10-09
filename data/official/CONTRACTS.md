# 已核实数据契约（2026-10-09）

## 实际可运行的无 Key 官方取数链路

官方展示页：
- 指数：https://www.sse.com.cn/aboutus/publication/monthly/index/
- 沪市分板每日交易与估值：https://www.sse.com.cn/aboutus/publication/monthly/report/
- 指标定义：https://www.sse.com.cn/aboutus/publication/monthly/explain/

网站实际脚本：https://www.sse.com.cn/xhtml/home/2021public/querySearch/search_publication_branch_2021.js

GET `https://query.sse.com.cn/commonQuery.do?sqlId=SQL_ID&isPagination=false&MDATE=yyyyMM`

请求头 `Referer: https://www.sse.com.cn/aboutus/publication/monthly/index/` 或 report页；无需 Key。
响应 `result[]`。202609 实测空数组，202608 有完整数据。默认回放应使用固定2026-08-31，不得冒充当日数据。

|数据|SQL_ID|字段|
|---|---|---|
|上证综指 000001.SH|COMMON_SSE_ZQZS_M_SSE_INDEX_C|MDATE yyyyMMdd, OPEN,HIGH,LOW,CLS指数点; TRD_VOL亿股; TRD_VAL亿元; NGT_VOL亿股; CPT_NGT亿元; RATIO百分比|
|沪深300 000300.SH|COMMON_SSE_ZQZS_M_CSI300_INDEX_C|同上|
|上证50 000016.SH|COMMON_SSE_ZQZS_M_SSE50_INDEX_C|同上|
|科创50 000688.SH|COMMON_SSE_ZQZS_M_KCB50_INDEX_C|同上|
|沪市主板每日成交|COMMON_SSE_ZQJY_D_MAIN_TRADE_C|MDATE; LST_VOL上市交易数; TRD_VOL亿股; TRD_VAL亿元; TRD_TRN万笔; AVG_PE平均市盈率; TO_RATE百分比|
|科创板每日成交|COMMON_SSE_ZQJY_D_KCB_TRADE_C|同上|

保存样本：
- `data/official/official-replay.json`：4指数×65交易日，2026-06-01～08-31。bars已按股/元归一，包含date/date_ms，指标字段兼容Fuyao。raw_sources含原始URL、文件与SHA256。
- `data/official/official-market-replay.json`：沪市主板+科创板，各65日，含成交与PE结构数据。
- 同目录18份回放 `*-raw.json`，另有2份公开接口探测响应；回放原始URL和SHA256由上述索引记录，可按URL重新请求。实施阶段的临时采样脚本未作为产品交付；运行时取数代码位于 `lib/market/providers.ts`。

边界：月报有延迟。指数成交额不可相加冒充全A。板块PE是上交所加权平均口径（总市值/总收益，上一年度EPS），不是指数PE/TTM，两个板块PE不可算术平均。没有找到该月报的上涨下跌家数、全A总额、北向流入、全A历史估值分位等数据，缺失应显示未覆盖。

## 扶摇（有Key后扩展）

已核验官方全文 https://fuyao.aicubes.cn/llms-full.txt ，临时下载的文档不随源码打包。

基础URL https://fuyao.aicubes.cn ，请求头 `X-api-key`。
业务信封 `{code,message,request_id,data}`，必须检查 `code===0`，不能只看HTTP 200。缺Key实际返回code=2003/message=Missing X-api-key，和文档2001不同；错误处理按非零code与message通用处理。能力权限缺失文档code2003，限流HTTP429/code4001，需降并发退避。

- 日历 `GET /api/a-share/calendar/trading-days`：无参数，固定最近一年，data.item[]含date yyyyMMdd / date_ms 上海00点毫秒戳。
- 指数快照 `GET /api/a-share-index/prices/snapshot?thscodes=000001.SH,000300.SH,000688.SH`：必传thscodes，无分页。data.item[]含last_price/prev_price/price_change/price_change_ratio_pct/open_price/high_price/low_price/volume/turnover。涨幅1.74表示1.74%；成交股/元；快照不含name。
- 指数日线 `GET /api/a-share-index/prices/historical?thscode=000001.SH&interval=1d&start=毫秒&end=毫秒`：单只指数，必须start/end，跨度≤10年，仅1d，无adjust或offset。data.item[]含date_ms/open_price/high_price/low_price/close_price/volume/turnover。
- 全市场当前快照 `GET /api/a-share/prices/snapshot?limit=100&offset=0`：省略thscodes才分页，total为全A代码表总数；需真正遍历全部页并校验覆盖后才计算市场宽度。没有历史快照日期参数。有效涨跌幅与price/volume都应验证，停牌/空值单独统计，不能用一页样本称全A。
- 个股最新估值 `GET /api/a-share/valuations/snapshot?thscodes=...`：默认最多100个原始token，字段pe_ttm/pe_mrq/pb_mrq/ps_ttm/pcf_ttm；空值null，负值不改；没有指数估值、历史估值或历史分位。
- 当前热榜 `GET /api/a-share/special-data/hot-stock-list?period=day`：Top30，period day/hour，data.item[]有thscode/ticker/name/rank/heat(string)/rank_change/rank_trend；作为关注度，非资金流/上涨概率。
- 历史热榜 `GET /api/a-share/special-data/hot-stock-list-history?date=yyyy-MM-dd`：自然日，过去一年，data.item[]仅thscode/ticker/name/rank。

最小接入：验证Key→日历取最新有效交易日→3指数快照+3次指数历史（例如90自然日或更长）→计算透明指标→输出支持与反证→可选补热榜/完整市场宽度。任一接口缺权限应保持可用部分并显示覆盖缺口，不切到模拟数据冒充实调。

来源页：
- https://fuyao.aicubes.cn/docs/quickstart/
- https://fuyao.aicubes.cn/docs/api-reference/prices/
- https://fuyao.aicubes.cn/docs/api-reference/a-share-index/
- https://fuyao.aicubes.cn/docs/api-reference/calendar/
- https://fuyao.aicubes.cn/docs/api-reference/valuations/
- https://fuyao.aicubes.cn/docs/api-reference/hot-list-data/
