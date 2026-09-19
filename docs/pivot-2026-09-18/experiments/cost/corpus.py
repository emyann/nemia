import json,glob,os,collections,datetime
from tx import analyze
root=os.path.expanduser('~/.claude/projects')
def ts(s):
    return datetime.datetime.fromisoformat(s.replace('Z','+00:00')).timestamp() if s else None
files=glob.glob(root+'/-home-yrnd1--agent-workflows-worktrees-*/*.jsonl')
sub=glob.glob(root+'/-home-yrnd1--agent-workflows-worktrees-*/*/subagents/*.jsonl')+glob.glob(root+'/-home-yrnd1--agent-workflows-worktrees-*/*/*.jsonl')
print('worker transcripts',len(files),'subagent transcripts',len(set(sub)))
T=collections.Counter()
bucket=collections.Counter()   # cache_read by context-size bucket
rebuild=collections.Counter()
rebuild_tok=collections.Counter()
sessions=[]
for p in files+list(set(sub)):
    try: rows,names,compact=analyze(p)
    except Exception as e: continue
    rows=[r for r in rows if r['model']!='<synthetic>']
    if not rows: continue
    prev_ctx=0; prev_t=None
    for r in rows:
        ctx=r['inp']+r['cw']+r['cr']
        for k in('inp','cw','cr','out'): T[k]+=r[k]
        T['n']+=1
        b='<100k' if ctx<100e3 else '100-200k' if ctx<200e3 else '200-400k' if ctx<400e3 else '400-600k' if ctx<600e3 else '>600k'
        bucket[b]+=ctx; bucket['n'+b]+=1
        t=ts(r['ts'])
        # a rebuild: most of an already-large context written to cache again instead of read
        if prev_ctx>40e3 and r['cw']>0.5*prev_ctx:
            gap=(t-prev_t)/60 if t and prev_t else -1
            cause='gap>60m' if gap>60 else 'gap 5-60m' if gap>5 else 'gap<5m'
            rebuild[cause]+=1; rebuild_tok[cause]+=r['cw']
        prev_ctx=ctx; prev_t=t
    ctxs=[r['inp']+r['cw']+r['cr'] for r in rows]
    sessions.append((max(ctxs),len(rows),sum(ctxs),ctxs[0],p,len(set(names)),compact))
print('TOTAL',dict(T))
tot=T['inp']+T['cw']+T['cr']
print('share of input: uncached %.3f%%  cache_write %.2f%%  cache_read %.2f%%'%(100*T['inp']/tot,100*T['cw']/tot,100*T['cr']/tot))
# relative price weights: input 1, 1h write 2, read 0.1, output 5
w=T['inp']*1+T['cw']*2+T['cr']*0.1+T['out']*5
print('cost share (weights 1/2/0.1/5): uncached %.1f%% write %.1f%% read %.1f%% output %.1f%%'%(100*T['inp']/w,100*T['cw']*2/w,100*T['cr']*0.1/w,100*T['out']*5/w))
print('input tokens by context size at the time of the call:')
for b in('<100k','100-200k','200-400k','400-600k','>600k'):
    print('  %-9s calls %6d  tokens %13d  %.1f%%'%(b,bucket['n'+b],bucket[b],100*bucket[b]/tot))
print('cache rebuilds (>=50%% of a >40k context re-written):',dict(rebuild),dict(rebuild_tok))
sessions.sort(reverse=True)
print('sessions',len(sessions),' max-context distribution:')
import statistics
mx=[s[0] for s in sessions]
for q in(0.5,0.75,0.9,0.95,1.0):
    print('  p%d %d'%(q*100,sorted(mx)[min(len(mx)-1,int(q*len(mx)))]))
print('first-call context: median %d'%statistics.median([s[3] for s in sessions]))
print('sessions with compaction:',sum(1 for s in sessions if s[6]),' sessions carrying >1 engine name (resumed):',sum(1 for s in sessions if s[5]>1))
big=[s for s in sessions if s[0]>200e3]
print('sessions whose context passed 200k: %d of %d, holding %.1f%% of all input tokens'%(len(big),len(sessions),100*sum(s[2] for s in big)/tot))
