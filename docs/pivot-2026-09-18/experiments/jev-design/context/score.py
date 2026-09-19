import json,statistics as st
res={o['id']:{x['name']:x['answers'] for x in o['res']} for o in json.load(open('results-record.json'))}
fd={o['id']:o for o in json.load(open('files_dataset.json'))}
scan=json.load(open('scan.json')); L=json.load(open('trap_labels.json'))['traps']
bul={b['i']:b for b in json.load(open('bullets.json'))}
def pr(pairs,th):
    tp=sum(1 for p,t in pairs if p>=th and t); fp=sum(1 for p,t in pairs if p>=th and not t); fn=sum(1 for p,t in pairs if p<th and t)
    return tp,fp,fn,(tp/(tp+fp) if tp+fp else float('nan')),(tp/(tp+fn) if tp+fn else float('nan'))
def show(name,pairs,ths=(0.1,0.2,0.3,0.5,0.8)):
    print(f'\n== {name}: {len(pairs)} pairs, {sum(1 for _,t in pairs if t)} positives')
    for th in ths:
        tp,fp,fn,p,r=pr(pairs,th); print(f'  P>={th}: precision {p:.2f} recall {r:.2f}  (tp {tp} fp {fp} fn {fn})')
def flips(kind,pref,ths=(0.2,0.5,0.8)):
    d=[];c={t:0 for t in ths};n=0
    for rid,r in res.items():
        a,b=r[kind+'#1'],r[kind+'#2']
        for k in a:
            if not k.startswith(pref): continue
            n+=1; x,y=a[k]['noul'],b[k]['noul']; d.append(abs(x-y))
            for t in ths:
                if (x>=t)!=(y>=t): c[t]+=1
    print(f'  two askings of {n}: mean |diff| {st.mean(d):.4f}, max {max(d):.3f}, crossings {c}')
# packages
PK=['packages/agent-engine','packages/agent-workflows','apps/api','apps/web']
pairs=[];base=[]
for rid,r in res.items():
    touched=fd[rid]['touched_all']; brief=fd[rid]['brief']
    for p in PK:
        t=any(f.startswith(p+'/') for f in touched)
        pairs.append((r['traps+pkgs#1']['pkg:'+p]['noul'],t))
        short=p.split('/')[1]
        base.append((1.0 if (p in brief or short in brief or (short=='agent-workflows' and ('`wf ' in brief or 'wf ' in brief)) or (short=='web' and ('board' in brief.lower() or 'page' in brief.lower())) or (short=='agent-engine' and 'engine' in brief.lower()) or (short=='api' and ('apps/api' in brief or ' api' in brief.lower()))) else 0.0,t))
show('PACKAGES (Jev)',pairs); flips('traps+pkgs','pkg:')
show('PACKAGES (baseline: name/keyword in brief)',base,(0.5,))
for p in PK:
    sub=[(r['traps+pkgs#1']['pkg:'+p]['noul'],any(f.startswith(p+'/') for f in fd[rid]['touched_all'])) for rid,r in res.items()]
    tp,fp,fn,pp,rr=pr(sub,0.5); print(f'   {p}: P {pp:.2f} R {rr:.2f} (pos {sum(1 for _,t in sub if t)})')
# exact-set accuracy
ok=sum(1 for rid,r in res.items() if all((r['traps+pkgs#1']['pkg:'+p]['noul']>=0.5)==any(f.startswith(p+'/') for f in fd[rid]['touched_all']) for p in PK))
print('  runs with the exact package set right at 0.5:',ok,'of',len(res))
# files
pairs=[];bpairs=[];rk={'jevN':[], 'jevC':[], 'base':[]}
for rid,r in res.items():
    truth=set(fd[rid]['truth']); cands=[c['path'] for c in fd[rid]['candidates']]; bs=fd[rid]['baseline']
    n=r['files#1']; ch=r['which#1']['which']['probabilities']
    for p in cands:
        pairs.append((n['file:'+p]['noul'],p in truth)); bpairs.append((bs[p],p in truth))
    for name,sc in (('jevN',lambda p:n['file:'+p]['noul']),('jevC',lambda p:ch.get(p,0)),('base',lambda p:bs[p])):
        order=sorted(cands,key=lambda p:-sc(p)); 
        row={}
        for k in (5,10,20):
            top=set(order[:k]); row[k]=(len(top&truth)/k, len(top&truth)/len(truth))
        rk[name].append(row)
show('FILES noul (Jev)',pairs,(0.05,0.1,0.2,0.3,0.5,0.8)); flips('files','file:')
show('FILES baseline score (named in brief / symbol grep)',bpairs,(0.2,0.5,1,5))
for name in rk:
    print(' ',name,' '.join(f'@{k}: P {st.mean(x[k][0] for x in rk[name]):.2f} R {st.mean(x[k][1] for x in rk[name]):.2f}' for k in (5,10,20)))
top1=sum(1 for rid,r in res.items() if r['which#1']['which']['choice'] in fd[rid]['truth']); print('  Choice top-1 is a touched file:',top1,'of',len(res))
# combined: max(noul, baseline named)
# traps
pairs=[];per={}
for rid,r in res.items():
    for k in L:
        t=scan[rid]['hits'][k]>0; p=r['traps+pkgs#1']['trap:'+k]['noul']
        pairs.append((p,t)); per.setdefault(k,[]).append((p,t))
show('TRAPS (Jev, full trap text as the question)',pairs,(0.05,0.1,0.2,0.3,0.5,0.8)); flips('traps+pkgs','trap:',(0.1,0.2,0.5))
print('  per trap at 0.2:')
for k,v in per.items():
    tp,fp,fn,pp,rr=pr(v,0.2); print(f'   {k:>2} {L[k]["name"]:<20} pos {tp+fn:>2}  P {pp:.2f} R {rr:.2f}  chars {bul[int(k)]["chars"]}')
# baseline for traps: web-ish traps apply iff brief mentions web/board/page/e2e ; others: keyword from regex in brief
import re
WEB={'3','4','6','8','10','11','12','13','14','16','17','18','19','20','21','23','24'}
bp=[]
for rid,r in res.items():
    b=fd[rid]['brief']; web=bool(re.search(r'apps/web|board|page|Factory|e2e|browser',b))
    for k in L:
        kw=all(re.search(p,b) for p in L[k]['all'])
        bp.append((1.0 if (kw or (k in WEB and web) or k in('25','5')) else 0.0, scan[rid]['hits'][k]>0))
show('TRAPS baseline (regex on brief, or web-ish brief => all web traps; 5 and 25 always)',bp,(0.5,))
# token arithmetic
for th in (0.1,0.2,0.5):
    kept=[];missed=[]
    for rid,r in res.items():
        kc=sum(bul[int(k)]['chars'] for k in L if r['traps+pkgs#1']['trap:'+k]['noul']>=th)
        kept.append(kc); missed.append(sum(1 for k in L if r['traps+pkgs#1']['trap:'+k]['noul']<th and scan[rid]['hits'][k]>0))
    total=sum(bul[int(k)]['chars'] for k in L)
    print(f'  th {th}: mean trap chars kept {st.mean(kept):.0f} of {total} ({1-st.mean(kept)/total:.0%} removed = {(total-st.mean(kept))/4:.0f} tokens); runs with >=1 applicable trap dropped: {sum(1 for m in missed if m)} of {len(missed)}, mean dropped {st.mean(missed):.2f}')
json.dump({'trap_pairs':[(rid,k,res[rid]['traps+pkgs#1']['trap:'+k]['noul'],scan[rid]['hits'][k]>0) for rid in res for k in L]},open('trap_pairs.json','w'))
