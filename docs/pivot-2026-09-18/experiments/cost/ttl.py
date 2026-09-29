import json,glob,os,collections,re
root=os.path.expanduser('~/.claude/projects')
seg=collections.defaultdict(lambda:collections.Counter())
first_meta={}
for p in glob.glob(root+'/-home-*--agent-workflows-worktrees-*/*.jsonl'):
    name=None; seen=set()
    for line in open(p,errors='replace'):
        if '"agent-name"' in line:
            try:
                e=json.loads(line)
                if e.get('type')=='agent-name': name=e['agentName']
            except: pass
            continue
        if '"assistant"' not in line: continue
        try: e=json.loads(line)
        except: continue
        m=e.get('message') or {}
        if e.get('type')!='assistant' or not m.get('usage') or m.get('model')=='<synthetic>' or m.get('id') in seen: continue
        seen.add(m['id'])
        u=m['usage']; cc=u.get('cache_creation') or {}
        s=seg[name]
        s['w5']+=cc.get('ephemeral_5m_input_tokens',0); s['w1h']+=cc.get('ephemeral_1h_input_tokens',0); s['n']+=1
        if name not in first_meta: first_meta[name]=(e.get('version'),e.get('timestamp'),u.get('service_tier'))
kind=collections.defaultdict(lambda:collections.Counter())
for name,s in seg.items():
    if not name: continue
    k='resumed (tryN/respond)' if re.search(r'-try\d+/|respond/',name) else 'first attempt'
    ttl='5m only' if s['w5'] and not s['w1h'] else '1h only' if s['w1h'] and not s['w5'] else 'mixed' if s['w5'] else 'none'
    kind[k][ttl]+=1; kind[k]['tok5']+=s['w5']; kind[k]['tok1h']+=s['w1h']
for k,v in kind.items(): print(k,dict(v))
# by date, for first attempts
bydate=collections.defaultdict(collections.Counter)
for name,s in seg.items():
    if not name or re.search(r'-try\d+/|respond/',name): continue
    d=(first_meta[name][1] or '')[:10]
    bydate[d]['5m' if s['w5']>s['w1h'] else '1h']+=1
    bydate[d]['v '+str(first_meta[name][0])]+=1
for d in sorted(bydate): print(d,dict(bydate[d]))
