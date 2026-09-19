import json,glob,os,datetime,collections
root=os.path.expanduser('~/.claude/projects')
def ts(s): return datetime.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp() if s else None
out=[]
for p in glob.glob(root+'/-home-yrnd1--agent-workflows-worktrees-*/*.jsonl'):
    name=None; pending=None; prev=None; seen=set()
    for line in open(p,errors='replace'):
        if '"agent-name"' in line:
            try: e=json.loads(line)
            except: continue
            if e.get('type')=='agent-name':
                if name is not None and e['agentName']!=name: pending=(name,e['agentName'])
                name=e['agentName']
            continue
        if '"assistant"' not in line: continue
        try: e=json.loads(line)
        except: continue
        m=e.get('message') or {}
        if e.get('type')!='assistant' or not m.get('usage') or m.get('model')=='<synthetic>' or m.get('id') in seen: continue
        seen.add(m['id'])
        u=m['usage']; t=ts(e.get('timestamp'))
        cur=dict(t=t,cw=u.get('cache_creation_input_tokens',0),cr=u.get('cache_read_input_tokens',0),inp=u.get('input_tokens',0))
        if pending and prev:
            out.append(dict(frm=pending[0],to=pending[1],gap=(t-prev['t'])/60,prev_ctx=prev['cw']+prev['cr']+prev['inp'],**cur))
            pending=None
        prev=cur
out.sort(key=lambda r:r['gap'])
print('%d resume boundaries'%len(out))
print('%-58s %8s %9s %9s %9s  %s'%('resumed as','gap min','prev ctx','written','read','verdict'))
hit=miss=0; misstok=0; hittok=0
for r in out:
    cold=r['cw']>0.5*r['prev_ctx']
    if cold: miss+=1; misstok+=r['cw']
    else: hit+=1; hittok+=r['cr']
    print('%-58s %8.1f %9d %9d %9d  %s'%(r['to'][-58:],r['gap'],r['prev_ctx'],r['cw'],r['cr'],'COLD — rewrote the context' if cold else 'warm'))
print('warm',hit,'cold',miss,'tokens rewritten on cold resumes',misstok)
