import json,re,statistics
R=json.load(open('probe-result.json')); D=json.load(open('dataset.json'))
F={f['id']:f for f in D['findings']}; B={b['run']:b for b in D['briefs']}
P='the-workflow-builder-on-the-4ifo the-workflow-builder-s-packa-x2ha markdown-rendered-on-the-boa-699m four-items-in-agent-workflow-w4eb three-small-items-on-the-boa-bmq6 the-end-of-a-run-is-a-step-o-y1wl the-supervisor-packages-agen-n7c2 six-findings-the-last-review-6no7'.split()
bmq6,w4eb,x2ha,b4ifo,m699,y1wl,n7c2,s6no7=('three-small-items-on-the-boa-bmq6','four-items-in-agent-workflow-w4eb','the-workflow-builder-s-packa-x2ha','the-workflow-builder-on-the-4ifo','markdown-rendered-on-the-boa-699m','the-end-of-a-run-is-a-step-o-y1wl','the-supervisor-packages-agen-n7c2','six-findings-the-last-review-6no7')
POS={'two-findings-the-apps-lane-s-1qur':[bmq6+'#1',bmq6+'#2'],
 'four-leftovers-on-the-board-fmk9':[b4ifo+'#1',b4ifo+'#2',m699+'#1'],
 'four-leftovers-in-agent-work-3uyy':[w4eb+'#1',w4eb+'#2',x2ha+'#1',x2ha+'#2'],
 'six-findings-the-last-review-6no7':[y1wl+'#%d'%i for i in range(1,7)],
 'five-leftovers-from-the-revi-c0tl':[n7c2+'#1',n7c2+'#2',n7c2+'#3',s6no7+'#1',s6no7+'#2']}
pos={(b,f) for b,fs in POS.items() for f in fs}
assert all(f in F for _,f in pos), [f for _,f in pos if f not in F]
pairs={tuple(k.split('|')):v for k,v in R['pairs'].items()}
print('pairs',len(pairs),'positives',len(pos),'negatives',len(pairs)-len(pos))
def pr(score,t):
    tp=sum(1 for k in pos if score[k]>=t); fp=sum(1 for k in score if k not in pos and score[k]>=t)
    return tp,fp,(tp/(tp+fp) if tp+fp else float('nan')),tp/len(pos)
first={k:v[0] for k,v in pairs.items()}
print('\nJEV, first asking only (what a recorded-once judgment would see)')
print('  threshold   TP  FP  precision  recall')
for t in(0.3,0.5,0.7,0.8,0.9,0.95):
    tp,fp,p,r=pr(first,t); print('  %8.2f  %4d %3d  %9.3f  %6.2f'%(t,tp,fp,p,r))
print('\npositives, P(yes) over 3 askings:')
for k in sorted(pos,key=lambda k:first[k]): print('  %.2f %.2f %.2f  %s ← %s'%(*pairs[k],k[0][-9:],k[1][-32:]))
neg=sorted(((first[k],k) for k in first if k not in pos),reverse=True)
print('\ntop negatives (false positives at a high threshold):')
for p,k in neg[:14]:
    when='AFTER the brief' if F[k[1]]['at']>B[k[0]]['createdAt'] else 'before'
    own='  [review of this very run]' if F[k[1]]['run']==k[0] else ''
    print('  %.2f  %s ← %s  (%s)%s'%(p,k[0][-9:],k[1][-34:],when,own))
hard=('six-findings-the-last-review-6no7',y1wl+'#7'); print('\nhard negative — "a seventh finding … leave it":',['%.2f'%x for x in pairs[hard]])
# exact negatives: finding written after the brief
ex=[k for k in first if F[k[1]]['at']>B[k[0]]['createdAt']]
print('exact negatives (finding postdates brief): %d, of which ≥0.5: %d, ≥0.8: %d'%(len(ex),sum(first[k]>=.5 for k in ex),sum(first[k]>=.8 for k in ex)))
# consistency
sd=[statistics.pstdev(v) for v in pairs.values()]
print('\nCONSISTENCY over 3 identical askings: mean sd %.4f, max spread %.2f'%(statistics.mean(sd),max(max(v)-min(v) for v in pairs.values())))
for t in(0.5,0.8,0.9):
    c=[k for k,v in pairs.items() if min(v)<t<=max(v)]
    print('  pairs that cross %.1f between askings: %d of %d (%.2f%%), positives among them: %d'%(t,len(c),len(pairs),100*len(c)/len(pairs),sum(k in pos for k in c)))
ms=[r['ms'] for r in R['requests']]; print('latency per 77-question request: median %d ms, max %d ms'%(statistics.median(ms),max(ms)))
# BASELINE: shared backticked symbols + file path
def syms(t): return set(s for s in re.findall(r'`([^`\n]{2,60})`',t))
def base(b,f):
    brief=B[b]['brief']; s=len(syms(F[f]['what'])&syms(brief)); path=1 if F[f]['file'] and (F[f]['file'] in brief or F[f]['file'].split('/')[-1] in brief) else 0
    return s+path
bs={k:base(*k) for k in pairs}
print('\nBASELINE (plain code): shared backticked symbols + file named in the brief')
print('  score>=    TP  FP  precision  recall')
for t in(1,2,3,4,5):
    tp,fp,p,r=pr(bs,t); print('  %7d  %4d %3d  %9.3f  %6.2f'%(t,tp,fp,p,r))
