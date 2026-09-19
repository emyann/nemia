import json,glob,os,re,statistics as st
ds=json.load(open('dataset.json'))
P=os.path.expanduser('~/.claude/projects/')
PATH=re.compile(r'((?:packages|apps|workflows|docs)/[\w./$-]+\.\w+|CLAUDE\.md|README\.md)')
rows=[]
for r in ds:
    fs=[f for d in glob.glob(P+'-home-yrnd1--agent-workflows-worktrees-'+r['id']+'-*') for f in glob.glob(d+'/*.jsonl')]
    best=None
    for f in fs:
        with open(f,errors='replace') as h:
            for line in h:
                try: o=json.loads(line)
                except: continue
                if o.get('timestamp'):
                    if best is None or o['timestamp']<best[0]: best=(o['timestamp'],f)
                    break
    if not best: continue
    touched=set(r['files']); cat={'touched':0,'untouched':0,'nopath':0}; pending={}; edited=False; after=0; calls=set()
    for line in open(best[1],errors='replace'):
        try: o=json.loads(line)
        except: continue
        m=o.get('message') or {}; c=m.get('content')
        if o.get('type')=='assistant' and isinstance(c,list):
            if m.get('id') not in calls:
                calls.add(m.get('id')); after+= 1 if edited else 0
            for b in c:
                if b.get('type')=='tool_use':
                    if b['name'] in('Edit','Write'): edited=True
                    pending[b['id']]=set(PATH.findall(json.dumps(b.get('input'))))
        elif o.get('type')=='user' and isinstance(c,list) and not edited:
            for b in c:
                if b.get('type')=='tool_result':
                    cc=b.get('content'); n=(len(cc) if isinstance(cc,str) else sum(len(x.get('text','')) if x.get('type')=='text' else 6000 for x in (cc or []) if isinstance(x,dict)))/4
                    ps=pending.get(b.get('tool_use_id'),set())
                    k='nopath' if not ps else ('touched' if ps&touched else 'untouched')
                    cat[k]+=n
    rows.append({'id':r['id'],**cat,'after':after,'calls':len(calls)})
json.dump(rows,open('explore.json','w'),indent=1)
for k in('touched','untouched','nopath'):
    print(k,'median',st.median(x[k] for x in rows),'mean',round(st.mean(x[k] for x in rows)))
d=[x['untouched']*(x['after']*0.5e-6+10e-6) for x in rows]
print('untouched-path exploration $: median',round(st.median(d),2),'mean',round(st.mean(d),2),'sum',round(sum(d)))
