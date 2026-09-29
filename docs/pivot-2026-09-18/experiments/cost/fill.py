import json,glob,os,re,collections,datetime
root=os.path.expanduser('~/.claude/projects')
W,R,O=10.0,0.5,25.0
bytool=collections.Counter(); ntool=collections.Counter(); bigreads=collections.Counter(); bigread_n=collections.Counter()
stepcost=collections.defaultdict(collections.Counter)
hourly=collections.Counter(); daily=collections.Counter()
img=0
for p in glob.glob(root+'/-home-*--agent-workflows-worktrees-*/*.jsonl'):
    name=None; seen=set(); uses={}
    for line in open(p,errors='replace'):
        if '"agent-name"' in line:
            try:
                e=json.loads(line)
                if e.get('type')=='agent-name': name=e['agentName']
            except: pass
            continue
        try: e=json.loads(line)
        except: continue
        m=e.get('message') or {}
        if e.get('type')=='assistant':
            for b in m.get('content') or []:
                if isinstance(b,dict) and b.get('type')=='tool_use':
                    uses[b['id']]=(b['name'],b.get('input') or {})
            if not m.get('usage') or m.get('model')=='<synthetic>' or m.get('id') in seen: continue
            seen.add(m['id']); u=m['usage']
            c=(u.get('cache_creation_input_tokens',0)*W+u.get('cache_read_input_tokens',0)*R+u.get('output_tokens',0)*O+u.get('input_tokens',0)*5)/1e6
            mm=re.match(r'ae/.+?-([a-z]+)(-try(\d+))?/\d+$',name or '')
            kind=(mm.group(1) if mm else '?'); tr='retry/round' if mm and mm.group(2) else 'first'
            stepcost[(kind,tr)]['$']+=c; stepcost[(kind,tr)]['calls']+=1
            t=e.get('timestamp','')
            daily[t[:10]]+=c; hourly[t[:13]]+=c
        elif e.get('type')=='user' and isinstance(m.get('content'),list):
            for b in m['content']:
                if isinstance(b,dict) and b.get('type')=='tool_result':
                    nm,inp=uses.get(b.get('tool_use_id'),('?',{}))
                    c=b.get('content'); size=0
                    if isinstance(c,str): size=len(c)
                    elif isinstance(c,list):
                        for x in c:
                            if x.get('type')=='text': size+=len(x.get('text',''))
                            elif x.get('type')=='image': img+=1; size+=6000
                    if nm=='Bash':
                        cmd=(inp.get('command') or '')
                        key='Bash: '+('npm test/typecheck/build/e2e' if re.search(r'npm (test|run)|node --test|turbo|playwright',cmd) else 'git' if re.match(r'\s*(cd [^&;]+(&&|;)\s*)?git ',cmd) else 'other')
                    elif nm.startswith('mcp__'): key='mcp: '+nm.split('__')[1]
                    else: key=nm
                    bytool[key]+=size; ntool[key]+=1
                    if nm=='Read':
                        f=os.path.basename(inp.get('file_path','?')); bigreads[f]+=size; bigread_n[f]+=1
tot=sum(bytool.values())
print('TOOL RESULTS entering context (chars; ~4 chars/token)  total %.0fM chars'%(tot/1e6))
for k,v in bytool.most_common(12): print('  %-38s %5.1f%%  %7d results  avg %6d chars'%(k,100*v/tot,ntool[k],v/ntool[k]))
print('images',img)
print('MOST-READ FILES (chars returned by Read, all sessions)')
for k,v in bigreads.most_common(12): print('  %-34s %6.1fM chars in %4d reads (avg %6d)'%(k,v/1e6,bigread_n[k],v/bigread_n[k]))
print('SPEND BY STEP (API-equivalent $, transcript-derived)')
T=sum(v['$'] for v in stepcost.values())
for k,v in sorted(stepcost.items(),key=lambda kv:-kv[1]['$']): print('  %-10s %-12s $%7.0f  %4.1f%%  %5d calls'%(*k,v['$'],100*v['$']/T,v['calls']))
print('  total $%.0f'%T)
print('BY DAY'); 
for d in sorted(daily): print('  %s $%6.0f'%(d,daily[d]))
hs=sorted(hourly)
def parse(h): return datetime.datetime.strptime(h,'%Y-%m-%dT%H')
best=(0,None)
for h in hs:
    t0=parse(h); s=sum(v for k,v in hourly.items() if 0<=(parse(k)-t0).total_seconds()<5*3600)
    if s>best[0]: best=(s,h)
print('peak 5-hour window: $%.0f starting %s UTC'%best)
print('peak single hour: $%.0f'%max(hourly.values()))
