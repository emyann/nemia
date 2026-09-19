import json,glob,os,sys,collections
root=os.path.expanduser('~/.claude/projects')
def analyze(path):
    seen={}
    order=[]
    names=[]
    model=collections.Counter()
    compact=0
    for line in open(path,errors='replace'):
        if '"agent-name"' in line:
            try:
                e=json.loads(line)
                if e.get('type')=='agent-name': names.append(e.get('agentName'))
            except: pass
        if '"compact_boundary"' in line or '"isCompactSummary":true' in line: compact+=1
        if '"assistant"' not in line: continue
        try: e=json.loads(line)
        except: continue
        if e.get('type')!='assistant': continue
        m=e.get('message') or {}
        u=m.get('usage'); mid=m.get('id')
        if not u or not mid: continue
        if mid not in seen: order.append(mid)
        seen[mid]=(u,e.get('timestamp'),m.get('model'),e.get('isSidechain'))
    rows=[]
    for mid in order:
        u,ts,mod,side=seen[mid]
        cc=u.get('cache_creation') or {}
        rows.append(dict(ts=ts,model=mod,side=side,inp=u.get('input_tokens',0),cw=u.get('cache_creation_input_tokens',0),cr=u.get('cache_read_input_tokens',0),out=u.get('output_tokens',0),cw5=cc.get('ephemeral_5m_input_tokens',0),cw1h=cc.get('ephemeral_1h_input_tokens',0)))
    return rows,names,compact
if __name__=='__main__':
    for p in sys.argv[1:]:
        rows,names,compact=analyze(p)
        if not rows: continue
        t=lambda k:sum(r[k] for r in rows)
        ctx=[r['inp']+r['cw']+r['cr'] for r in rows]
        print(os.path.basename(os.path.dirname(p))[-50:],os.path.basename(p)[:8],'names',list(dict.fromkeys(names))[:4])
        print('  responses',len(rows),'models',collections.Counter(r['model'] for r in rows).most_common(3),'compactions',compact)
        print('  uncached %d  cache_write %d (5m %d / 1h %d)  cache_read %d  output %d'%(t('inp'),t('cw'),t('cw5'),t('cw1h'),t('cr'),t('out')))
        print('  context first %d  max %d  last %d'%(ctx[0],max(ctx),ctx[-1]))
