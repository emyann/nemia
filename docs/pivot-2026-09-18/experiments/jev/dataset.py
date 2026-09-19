import json,glob,os,re
R=os.path.expanduser('~/.agent-workflows')
# last review closeout per run, by event time
last={}
for f in glob.glob(R+'/engine/tasks/*review*.jsonl'):
    base=os.path.basename(f)[:-6]
    if base.endswith('-check'): continue
    run=re.sub(r'-review(-try\d+)?$','',base)
    for l in open(f):
        e=json.loads(l)
        if e.get('kind')=='ended' and isinstance(e.get('closeout'),dict) and 'findings' in e['closeout']:
            if run not in last or e['at']>last[run]['at']: last[run]={'at':e['at'],'c':e['closeout']}
findings=[]
for run,v in sorted(last.items()):
    if v['c'].get('again'): continue
    for i,fd in enumerate(v['c'].get('findings') or []):
        findings.append({'id':'%s#%d'%(run,i+1),'run':run,'at':v['at'],'file':fd.get('file') or fd.get('where') or '', 'what':fd.get('what') or json.dumps(fd)})
briefs=[]
for f in glob.glob(R+'/runs/*.json'):
    try: r=json.load(open(f))
    except Exception: continue
    if isinstance(r,dict) and r.get('brief'): briefs.append({'run':os.path.basename(f)[:-5],'createdAt':r.get('createdAt') or r.get('startedAt') or '', 'brief':r['brief']})
briefs.sort(key=lambda b:b['createdAt'])
json.dump({'findings':findings,'briefs':briefs},open('dataset.json','w'),indent=1)
print('final reviews (again:false):',sum(1 for v in last.values() if not v['c'].get('again')),' findings:',len(findings),' briefs:',len(briefs))
print('finding keys sample:',list((last[findings[0]['run']]['c']['findings'][0]).keys()))
print('brief createdAt sample:',briefs[0]['createdAt'],'→',briefs[-1]['createdAt'])
