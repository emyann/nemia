import json,glob,os,collections
from tx import analyze
root=os.path.expanduser('~/.claude/projects')
W,R,O=10.0,0.5,25.0
def cost(rows): return sum(r['cw']*W+r['cr']*R+r['out']*O+r['inp']*5 for r in rows)/1e6
groups={'workers':glob.glob(root+'/-home-yrnd1--agent-workflows-worktrees-*/*.jsonl'),
        'main checkout (interactive, supervisor, ship)':glob.glob(root+'/-home-yrnd1-projects-hkb-v2/*.jsonl')}
for g,files in groups.items():
    allrows=[]
    for p in files:
        try: rows,_,_=analyze(p)
        except Exception: continue
        allrows+= [r for r in rows if r['model']!='<synthetic>' and (r['ts'] or '')>='2026-09-12']
    if not allrows: continue
    c=cost(allrows)
    print('%s: %d sessions, %d calls, $%.0f  (write $%.0f, read $%.0f, output $%.0f)'%(g,len(files),len(allrows),c,sum(r['cw'] for r in allrows)*W/1e6,sum(r['cr'] for r in allrows)*R/1e6,sum(r['out'] for r in allrows)*O/1e6))
    if g=='workers':
        for cap in(150e3,200e3,300e3):
            saved=sum(max(0,(r['cr']+r['cw']+r['inp'])-cap) for r in allrows)*R/1e6
            print('   if no call ever carried more than %dk of context: -$%.0f (%.0f%%)'%(cap/1e3,saved,100*saved/c))
        print('   models:',collections.Counter(r['model'] for r in allrows).most_common(4))
    else:
        print('   models:',collections.Counter(r['model'] for r in allrows).most_common(4))
        ctx=sorted(r['cr']+r['cw']+r['inp'] for r in allrows); print('   context per call: median %d  p90 %d  max %d'%(ctx[len(ctx)//2],ctx[int(.9*len(ctx))],ctx[-1]))
