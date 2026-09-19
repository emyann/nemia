import json,re,glob,os,random
random.seed(7)
T=json.load(open('tasks.json'))
SECRET=re.compile(r'(sk-[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|Bearer\s+\S+|[A-Z_]*API_KEY\s*=\s*\S+)')
def clean(s): return SECRET.sub('[redacted]',s or '')
def last_closeout(t):
    co=[e['closeout'] for e in t['ended'] if e.get('closeout')]
    return co[-1] if co else None
# E1: reviews with `again`
e1=[]
for t in T.values():
    co=last_closeout(t)
    if co and 'again' in co:
        e1.append({'id':t['id'],'again':bool(co['again']),'summary':clean(co['summary']),
                   'findings':[{'file':f.get('file'),'line':f.get('line'),'what':clean(f.get('what') or f.get('problem') or json.dumps(f))} for f in (co.get('findings') or [])]})
json.dump(e1,open('e1-reviews.json','w'),indent=1)
# E5: closeout x check
e5=[]
for t in T.values():
    if not t['id'].endswith('-check'): continue
    s=T.get(t['id'][:-6]); co=last_closeout(s) if s else None
    if not co: continue
    p='/home/yrnd1/.agent-workflows/checks/'+t['id']+'.stderr'
    err=open(p).read()[-500:] if os.path.exists(p) else ''
    ex=[e.get('exitCode') for e in t['ended']][-1] if t['ended'] else None
    e5.append({'id':t['id'],'settled':t.get('settled'),'exit':ex,'closeout':clean(co['summary']),'stderr':clean(err)})
json.dump(e5,open('e5-closeouts.json','w'),indent=1)
print('e1',len(e1),'e5',len(e5),[ (x['id'],x['exit']) for x in e5 if x['exit']!=0])
# E4: needs x messages
needs=[]
for t in T.values():
    co=last_closeout(t)
    for e in t['ended']:
        c=e.get('closeout')
        if c and c.get('outcome')=='blocked': needs.append({'task':t['id'],'summary':clean(c['summary']),'needs':clean(c['needs'])})
msgs=[]
for f in glob.glob('/home/yrnd1/.agent-workflows/runs/*.asks/**/*',recursive=True):
    if os.path.isfile(f):
        o=json.load(open(f))
        if o.get('message'): msgs.append({'run':f.split('/runs/')[1].split('.asks')[0],'step':o['step'],'message':clean(o['message'])})
json.dump({'needs':needs,'messages':msgs},open('e4-needs.json','w'),indent=1)
print('needs',len(needs),'msgs',len(msgs))
# E2: operator merge asks -> run -> final review
rows=json.load(open('ask-rows.json'))
runs=[os.path.basename(f)[:-5] for f in glob.glob('/home/yrnd1/.agent-workflows/runs/*.json')]
def slug(s): return re.sub(r'[^a-z0-9]+','-',s.lower()).strip('-')
e2=[]
for r in rows:
    if not r['chosen'] or not any(re.match(r'(Merge|Ship|Approve ship|By hand)',l) for l in r['labels']): continue
    q=r['q']; rid=None
    m=re.search(r'\(([a-z0-9-]+-[a-z0-9]{4})\)',q)
    if m and m.group(1) in runs: rid=m.group(1)
    else:
        m=re.search(r'— (.+?) (?:\(|—|finished|is at)',q)
        if m:
            sl=slug(m.group(1))[:24]
            c=[x for x in runs if x.startswith(sl[:20])]
            if len(c)==1: rid=c[0]
    if not rid: continue
    revs=sorted([t for t in T.values() if t['id'].startswith(rid+'-review') and last_closeout(t)],key=lambda t:t.get('filedAt',''))
    if not revs: continue
    co=last_closeout(revs[-1])
    plus=('+' in r['chosen']) or r['chosen'].startswith('By hand') or ', then' in r['chosen'] or 'file F2' in r['chosen']
    e2.append({'run':rid,'at':r['at'],'chosen':r['chosen'],'more_than_merge':plus,'summary':clean(co['summary']),'again':co.get('again'),
               'findings':[clean(f.get('what') or json.dumps(f)) for f in (co.get('findings') or [])]})
json.dump(e2,open('e2-finished.json','w'),indent=1)
print('e2',len(e2),'positives',sum(x['more_than_merge'] for x in e2)); 
for x in e2: print(' ',x['run'][:40],x['chosen'][:40],len(x['findings']),x['again'])
