"""Local end-to-end HTTP checks; credentials remain inside the running server."""
import json, os, urllib.request, urllib.error

BASE=os.environ.get('MARKET_LENS_TEST_URL','http://127.0.0.1:5173').rstrip('/')
results=[]
def call(path, payload=None, raw=None):
    data=raw if raw is not None else json.dumps(payload,ensure_ascii=False).encode() if payload is not None else None
    req=urllib.request.Request(BASE+path,data=data,headers={'Content-Type':'application/json'})
    try:
        with urllib.request.urlopen(req,timeout=55) as response:return response.status,json.load(response)
    except urllib.error.HTTPError as error:return error.code,json.load(error)
def check(name,condition):
    results.append({'name':name,'passed':bool(condition)})
    print(('PASS ' if condition else 'FAIL ')+name)

status,config=call('/api/config');check('configuration only returns connection flags',status==200 and 'fuyaoConfigured' in config and not any('key' in k.lower() for k in config))
request={'index':'000001.SH','window':20,'asOf':'2026-08-31','mode':'replay'}
status,data=call('/api/research',request);report=data.get('report',{})
check('official replay produces evidence, coverage and snapshot fingerprint',status==200 and len(report.get('evidence',[]))==7 and len(report.get('snapshotFingerprint',''))==64)
follow={'request':dict(report['request'],asOf=report['asOf']),'snapshotFingerprint':report['snapshotFingerprint'],'question':'哪些风险变量值得继续核验？'}
status,data=call('/api/followup',follow);check('followup preserves exact report as-of date',status==200 and data.get('asOf')==report['asOf'])
status,data=call('/api/followup',dict(follow,snapshotFingerprint='0'*64));check('changed snapshot is intentionally rejected',status==409 and data.get('code')=='SNAPSHOT_CHANGED')
status,data=call('/api/followup',dict(follow,question='现在是否适合购入沪深三百ETF？'));check('trading question redirects to research boundaries',status==200 and data.get('model',{}).get('status')=='refused')
for label,payload in [('invalid date',dict(request,asOf='2026-02-31')),('future date',dict(request,asOf='2099-01-01')),('invalid index',dict(request,index='INVALID'))]:
    status,data=call('/api/research',payload);check(label+' returns 400',status==400)
status,data=call('/api/research',raw=b'{');check('malformed JSON returns 400',status==400)
status,data=call('/api/research',raw=b'x'*12001);check('oversized body returns 413',status==413)
status,data=call('/api/followup',dict(follow,request=dict(request,asOf='2099-01-01')));check('followup rejects future date consistently',status==400)
if config.get('fuyaoConfigured'):
    status,data=call('/api/research',dict(request,mode='fuyao',asOf=config['latestCompletedDate']));live=data.get('report',{})
    check('real Fuyao calendar and histories produce a completed-session report',status==200 and live.get('asOf')==config['latestCompletedDate'] and any(t['status']=='success' and '历史日线' in t['tool'] for t in live.get('traces',[])))
    check('real model response is generated or explicitly degraded',live.get('model',{}).get('status') in ['generated','failed','unconfigured'])
    print('Real model status:',live.get('model',{}).get('status'),live.get('model',{}).get('reason',''))
print(f"\n{sum(r['passed'] for r in results)}/{len(results)} HTTP checks passed")
raise SystemExit(0 if all(r['passed'] for r in results) else 1)
