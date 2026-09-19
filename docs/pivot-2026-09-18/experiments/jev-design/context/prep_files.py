import json,subprocess,re
REPO='/home/yrnd1/projects/hkb-v2'
ds=json.load(open('dataset.json'))
runs={}
import glob,os
for f in glob.glob(os.path.expanduser('~/.agent-workflows/runs/*.json')):
    r=json.load(open(f)); runs[r['id']]=r
CAND=re.compile(r'^(packages|apps)/[^/]+/(src|test)/.*\.(ts|tsx)$')
desc_cache={}
def git(*a): return subprocess.run(['git','-C',REPO,*a],capture_output=True,text=True,errors='replace').stdout
def desc(sha):
    if sha in desc_cache: return desc_cache[sha]
    t=git('cat-file','-p',sha)[:3000]
    m=re.search(r'/\*\*(.*?)\*/',t,re.S)
    d=''
    if m and m.start()<400:
        d=re.sub(r'\s*\n\s*\*\s?',' ',m.group(1)).strip()
    d=re.sub(r'\s+',' ',d)[:220]
    desc_cache[sha]=d; return d
out=[]
for x in ds:
    base=runs[x['id']]['baseRef']
    tree=[l.split() for l in git('ls-tree','-r',base).split('\n') if l]
    cands=[{'path':p,'desc':desc(sha)} for _,_,sha,p in tree if CAND.match(p) and 'routeTree.gen' not in p]
    paths=[c['path'] for c in cands]
    truth=sorted(set(x['files'])&set(paths))
    # baseline: named in brief + backticked symbol grep at baseRef
    brief=x['brief']; score={p:0.0 for p in paths}
    for p in paths:
        if p in brief: score[p]+=10
        elif re.search(r'(?<![\w/])'+re.escape(os.path.basename(p))+r'(?![\w])',brief): score[p]+=5
    syms=set(s for s in re.findall(r'`([^`\n]{3,60})`',brief))
    nsym=0
    for s in syms:
        s0=s.split('(')[0].strip()
        if len(s0)<3 or ' ' in s0 and len(s0)>40: continue
        hit=[l for l in git('grep','-l','-F','-e',s0,base,'--',*['packages','apps']).split('\n') if l]
        hit=[h.split(':',1)[1] for h in hit]
        hit=[h for h in hit if h in score]
        if 0<len(hit)<=25:
            nsym+=1
            for h in hit: score[h]+=1.0/len(hit)**0.5
    out.append({'id':x['id'],'brief':brief,'candidates':cands,'truth':truth,'touched_all':x['files'],'baseline':score,'new_files':sorted(set(f for f in x['files'] if CAND.match(f))-set(paths))})
json.dump(out,open('files_dataset.json','w'))
import statistics as st
print(len(out), st.median(len(o['candidates']) for o in out), st.median(len(o['truth']) for o in out), sum(1 for o in out if not o['truth']), st.median(len(o['new_files']) for o in out))
