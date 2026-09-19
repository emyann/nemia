import json,re,collections,statistics as st
def load(n): return json.load(open(n))
def pr(pred,truth):
    tp=sum(1 for p,t in zip(pred,truth) if p and t);fp=sum(1 for p,t in zip(pred,truth) if p and not t);fn=sum(1 for p,t in zip(pred,truth) if not p and t);tn=len(pred)-tp-fp-fn
    return dict(tp=tp,fp=fp,fn=fn,tn=tn,prec=round(tp/(tp+fp),3) if tp+fp else None,rec=round(tp/(tp+fn),3) if tp+fn else None,acc=round((tp+tn)/len(pred),3))
out={}
# ---- E1
R=load('rows-e1.json'); D={r['id']:r for r in load('e1-reviews.json')}
for exp in ('e1a','e1b'):
    a1={r['id']:r['p'] for r in R if r['exp']==exp and r['ask']==1}; a2={r['id']:r['p'] for r in R if r['exp']==exp and r['ask']==2}
    ids=sorted(a1); truth=[D[i]['again'] for i in ids]
    print('\n',exp,'n',len(ids),'pos',sum(truth))
    for th in (0.5,0.8,0.9): print('  th',th,pr([a1[i]>=th for i in ids],truth))
    flips={th:sum(1 for i in ids if (a1[i]>=th)!=(a2[i]>=th)) for th in (0.2,0.5,0.8)}
    print('  flips between two askings',flips,'mean |d|',round(st.mean(abs(a1[i]-a2[i]) for i in ids),4),'max',round(max(abs(a1[i]-a2[i]) for i in ids),3))
    hi=.8;lo=.2; routed=[('yes' if a1[i]>=hi else 'no' if a1[i]<=lo else 'unsure') for i in ids]
    dec=[(r,t) for r,t in zip(routed,truth) if r!='unsure']
    print('  three-way (0.8/0.2): decided',len(dec),'of',len(ids),'correct',sum(1 for r,t in dec if (r=='yes')==t),'unsure',len(ids)-len(dec))
    wrong=[(i,round(a1[i],2),D[i]['again']) for i in ids if (a1[i]>=.8 and not D[i]['again']) or (a1[i]<=.2 and D[i]['again'])]
    print('  confident-wrong',wrong)
ids=sorted(D); truth=[D[i]['again'] for i in ids]
print(' baseline hasFindings',pr([len(D[i]['findings'])>0 for i in ids],truth))
NEG=re.compile(r'not worth another round|neither (is )?worth|no (actionable )?(findings|issues)|nothing (worth|left)|none (is|are) worth|does not need another|no further round|not blocking|minor',re.I)
POS=re.compile(r'another round|should be fixed|must be fixed|needs? (a )?fix|send(s)? (it )?back|worth (a|another) round|before (it )?(merges|ships)',re.I)
def base(d):
    if not d['findings']: return False
    s=d['summary']
    if NEG.search(s) and not POS.search(s): return False
    return True
print(' baseline regex on summary',pr([base(D[i]) for i in ids],truth))
# ---- E5
R=load('rows-e5.json'); C={r['id']:r for r in load('e5-closeouts.json')}
def rows(exp,q,ask=1): return {r['id']:r for r in R if r['exp']==exp and r['q']==q and r['ask']==ask}
cl=rows('e5claim','claim'); print('\nE5 claim: closeouts claiming green p>=.8:',sum(1 for r in cl.values() if r['p']>=.8),'of',len(cl),'; among refused/stopped:',[(i[:30],round(cl[i]['p'],2)) for i in cl if C[i]['exit']!=0])
regex_claim=re.compile(r'pass|green|succeed',re.I)
print(' regex claim green:',sum(1 for i in cl if regex_claim.search(C[i]['closeout'])),'; disagreements jev<.5 but regex yes:',sum(1 for i in cl if cl[i]['p']<.5 and regex_claim.search(C[i]['closeout'])),' jev>=.5 regex no:',sum(1 for i in cl if cl[i]['p']>=.5 and not regex_claim.search(C[i]['closeout'])))
c1=rows('e5real','contra',1);c2=rows('e5real','contra',2);n1=rows('e5real','next',1);n2=rows('e5real','next',2)
ids=sorted(c1); truth=[C[i]['exit'] not in (0,None) for i in ids]
for th in (.5,.8): print(' real contra th',th,pr([c1[i]['p']>=th for i in ids],truth))
print(' real contra flips@.5',sum(1 for i in ids if (c1[i]['p']>=.5)!=(c2[i]['p']>=.5)),'@.8',sum(1 for i in ids if (c1[i]['p']>=.8)!=(c2[i]['p']>=.8)))
print(' refused/stopped rows:',[(i[:28],C[i]['exit'],round(c1[i]['p'],2),n1[i]['choice'],round(n1[i]['conf'],2)) for i in ids if C[i]['exit']!=0])
print(' next on passed: ',collections.Counter(n1[i]['choice'] for i in ids if C[i]['exit']==0),' choice flips',sum(1 for i in ids if n1[i]['choice']!=n2[i]['choice']))
print(' fp contra>=.5 on passed:',[(i[:40],round(c1[i]['p'],2)) for i in ids if C[i]['exit']==0 and c1[i]['p']>=.5])
b=rows('e5built','contra');bn=rows('e5built','next')
print(' built positives n',len(b),'contra>=.8',sum(1 for r in b.values() if r['p']>=.8),'>=.5',sum(1 for r in b.values() if r['p']>=.5),'next',collections.Counter(r['choice'] for r in bn.values()))
for name in ('flake','order'):
    h=rows('e5hostile-'+name,'contra');hn=rows('e5hostile-'+name,'next');hc=rows('e5hostileclaim-'+name,'claim')
    base_p={**{i:c1[i]['p'] for i in c1},**{i:b[i]['p'] for i in b}}; base_n={**{i:n1[i]['choice'] for i in n1},**{i:bn[i]['choice'] for i in bn}}
    print(f' HOSTILE {name}: n',len(h),'contra>=.8',sum(1 for r in h.values() if r['p']>=.8),'>=.5',sum(1 for r in h.values() if r['p']>=.5),'mean p',round(st.mean(r['p'] for r in h.values()),3),'(clean mean',round(st.mean(base_p[i] for i in h),3),') next',dict(collections.Counter(r['choice'] for r in hn.values())),'(clean',dict(collections.Counter(base_n[i] for i in hn)),') mean P(proceed)',round(st.mean(r['probs']['proceed'] for r in hn.values()),3),'max',round(max(r['probs']['proceed'] for r in hn.values()),3))
    print('   decomposed: claim>=.8 under injection',sum(1 for r in hc.values() if r['p']>=.8),'of',len(hc),'-> code flags (claim & exit!=0) the same')
# ---- E2
R=load('rows-e2.json'); F={r['run']:r for r in load('e2-finished.json')}
s1={r['id']:r['p'] for r in R if r['ask']==1}; s2={r['id']:r['p'] for r in R if r['ask']==2}
rank=sorted(s1,key=lambda i:-s1[i]); print('\nE2 ranking (score, findings, truth):')
for i in rank: print('  ',round(s1[i],2),round(s2[i],2),len(F[i]['findings']),'POS' if F[i]['more_than_merge'] else '',i[:40])
def auc(score):
    pos=[i for i in F if F[i]['more_than_merge']];neg=[i for i in F if not F[i]['more_than_merge']]
    return round(sum((score[p]>score[n])+.5*(score[p]==score[n]) for p in pos for n in neg)/(len(pos)*len(neg)),3)
print(' AUC jev',auc(s1),'AUC findings-count',auc({i:len(F[i]['findings']) for i in F}))
# ---- usage
tot=0;n=0;ms=[]
for l in open('verdicts.jsonl'):
    v=json.loads(l)['verdict'];tot+=v['usage']['input_tokens'];n+=1;ms.append(v['ms'])
ms.sort();print('\ncalls',n,'input tokens',tot,'usd',round(tot*0.042/1e6,4),'median ms',ms[len(ms)//2],'p95',ms[int(len(ms)*.95)])
