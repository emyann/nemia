# Read-only over the repo and the store. Builds dataset.json: briefs with what the branch touched; review closeouts with `again`.
import json,glob,os,subprocess,re
STORE=os.path.expanduser('~/.agent-workflows'); REPO='/home/yrnd1/projects/hkb-v2'
def git(*a):
    p=subprocess.run(['git','-C',REPO,*a],capture_output=True,text=True)
    return p.stdout if p.returncode==0 else None
runs=[]
for f in sorted(glob.glob(STORE+'/runs/*.json')):
    r=json.load(open(f))
    if r.get('repo')!=REPO: continue
    br=(r['steps'].get('implement') or {}).get('branch')
    if not br or git('rev-parse','--verify','-q',br) is None: continue
    names=git('diff','--name-only',f"{r['baseRef']}...{br}")
    if names is None: continue
    files=[x for x in names.split('\n') if x]
    if not files: continue
    stat=git('diff','--shortstat',f"{r['baseRef']}...{br}").strip()
    m=re.findall(r'(\d+) (?:insertion|deletion)',stat); lines=sum(map(int,m))
    runs.append(dict(id=r['id'],workflow=os.path.basename(r['workflowDir']),brief=r['brief'],files=files,lines=lines,
      touchesWeb=any(x.startswith('apps/web/') for x in files),
      touchesWebSrc=any(x.startswith('apps/web/src/') for x in files),
      pkgs=sorted({'/'.join(x.split('/')[:2]) for x in files if x.startswith(('apps/','packages/'))})))
reviews=[]
for f in sorted(glob.glob(STORE+'/engine/tasks/*review*.jsonl')):
    filed=None;co=None;cost=None
    for l in open(f):
        try:o=json.loads(l)
        except: continue
        if o.get('kind')=='filed': filed=o
        if o.get('kind')=='ended' and o.get('closeout'): co=o['closeout']
        if o.get('kind')=='measured': cost=o['usage'].get('costUsd')
    if co and isinstance(co.get('findings'),list) and isinstance(co.get('again'),bool):
        reviews.append(dict(task=os.path.basename(f)[:-6],findings=co['findings'],again=co['again'],summary=co.get('summary',''),outcome=co.get('outcome'),cost=cost))
json.dump(dict(runs=runs,reviews=reviews),open('dataset.json','w'),indent=1)
print(len(runs),'runs;',sum(r['touchesWeb'] for r in runs),'touch apps/web;',sum(r['touchesWebSrc'] for r in runs),'touch apps/web/src')
import collections
print(collections.Counter((r['workflow'],r['touchesWeb']) for r in runs))
print(len(reviews),'reviews;',sum(r['again'] for r in reviews),'again; empty findings:',sum(not r['findings'] for r in reviews), 'again with empty:',sum(r['again'] and not r['findings'] for r in reviews), 'not again with findings:',sum((not r['again']) and bool(r['findings']) for r in reviews))
print(json.dumps(reviews[5]['findings'][:2],indent=1)[:1200])
