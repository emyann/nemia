import json,glob,subprocess,os
REPO='/home/yrnd1/projects/hkb-v2'
out=[]
for f in sorted(glob.glob(os.path.expanduser('~/.agent-workflows/runs/*.json'))):
    r=json.load(open(f))
    if r.get('repo')!=REPO: continue
    tips=r.get('tips') or {}
    files=set(); ok=False
    for br,sha in tips.items():
        p=subprocess.run(['git','-C',REPO,'diff','--name-only',f"{r['baseRef']}...{sha}"],capture_output=True,text=True)
        if p.returncode==0:
            ok=True; files|=set(x for x in p.stdout.split('\n') if x)
    if not ok or not files: continue
    out.append({'id':r['id'],'createdAt':r['createdAt'],'brief':r['brief'],'workflow':os.path.basename(r.get('workflowDir') or ''),
      'files':sorted(files),'steps':{k:[t['taskId'] for t in v.get('tries',[])]+[v.get('taskId')] for k,v in r['steps'].items()}})
json.dump(out,open('dataset.json','w'),indent=1)
print(len(out)); 
import statistics
print(statistics.median(len(x['brief']) for x in out), max(len(x['brief']) for x in out), statistics.median(len(x['files']) for x in out))
from collections import Counter
c=Counter()
for x in out:
    for p in set('/'.join(f.split('/')[:2]) for f in x['files']): c[p]+=1
print(c.most_common(20))
