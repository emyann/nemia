import json,glob,os,statistics
from tx import analyze
root=os.path.expanduser('~/.claude/projects'); tasks=os.path.expanduser('~/.agent-workflows/engine/tasks/')
cost={}
for f in glob.glob(tasks+'*.jsonl'):
    for l in open(f):
        e=json.loads(l)
        if e.get('kind') in('measured','ended') and (e.get('usage') or {}).get('costUsd') is not None:
            cost['ae/%s/%d'%(os.path.basename(f)[:-6],e['attempt'])]=e['usage']['costUsd']
data=[]
for p in glob.glob(root+'/-home-yrnd1--agent-workflows-worktrees-*/*.jsonl'):
    rows,names,_=analyze(p)
    names=list(dict.fromkeys(names)); rows=[r for r in rows if r['model']!='<synthetic>']
    if len(names)!=1 or names[0] not in cost or not rows: continue
    s=lambda k:sum(r[k] for r in rows)/1e6
    data.append((s('inp'),s('cw'),s('cr'),s('out'),cost[names[0]],max(r['inp']+r['cw']+r['cr'] for r in rows)))
def solve(A,b):
    n=len(A)
    M=[r[:]+[b[i]] for i,r in enumerate(A)]
    for i in range(n):
        p=max(range(i,n),key=lambda r:abs(M[r][i])); M[i],M[p]=M[p],M[i]
        for r in range(n):
            if r!=i:
                f=M[r][i]/M[i][i]; M[r]=[x-f*y for x,y in zip(M[r],M[i])]
    return [M[i][n]/M[i][i] for i in range(n)]
def fit(ds):
    X=[[d[1],d[2],d[3]] for d in ds]; y=[d[4] for d in ds]
    A=[[sum(x[i]*x[j] for x in X) for j in range(3)] for i in range(3)]; b=[sum(x[i]*yy for x,yy in zip(X,y)) for i in range(3)]
    c=solve(A,b); err=statistics.median(abs(sum(ci*xi for ci,xi in zip(c,x))-yy)/max(yy,0.5) for x,yy in zip(X,y))
    return c,err
print('single-attempt sessions with a recorded cost:',len(data),' total $%.0f'%sum(d[4] for d in data))
for label,ds in(('all',data),('never past 200k',[d for d in data if d[5]<=200e3]),('passed 200k',[d for d in data if d[5]>200e3])):
    c,err=fit(ds); print('%-16s n=%3d  write $%.2f/M  read $%.3f/M  output $%.2f/M   median error %.1f%%'%(label,len(ds),*c,100*err))
