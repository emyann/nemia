import json,glob,os,collections
T={}
for f in glob.glob('/home/yrnd1/.agent-workflows/engine/tasks/*.jsonl'):
    id=os.path.basename(f)[:-6]; t={'id':id,'ended':[],'kinds':collections.Counter()}
    for l in open(f):
        try:o=json.loads(l)
        except: continue
        k=o.get('kind'); t['kinds'][k]+=1
        if k=='filed':
            t['filedAt']=o['at']; t['filedKeys']=[x for x in o if x not in('brief',)]; t['brief']=o.get('brief'); t['command']=o.get('command') or o.get('check')
        if k=='ended': t['ended'].append({x:o.get(x) for x in ('at','observed','reason','closeout','exitCode','attempt','output')})
        if k=='settled': t['settled']=o.get('outcome'); t['settledAt']=o['at']
        if k=='measured': t['cost']=t.get('cost',0)+(o.get('usage') or {}).get('costUsd',0)
    t['kinds']=dict(t['kinds']); T[id]=t
json.dump(T,open('tasks.json','w'))
c=collections.Counter()
for t in T.values():
    ischeck=t['id'].endswith('-check')
    co=[e['closeout'] for e in t['ended'] if e.get('closeout')]
    c[('check' if ischeck else 'step', t.get('settled'), co[-1]['outcome'] if co else None)]+=1
for k,v in sorted(c.items(),key=str): print(k,v)
x=[t for t in T.values() if t['id'].endswith('-check')][0]
print(x['filedKeys'], json.dumps(x['ended'])[:800])
