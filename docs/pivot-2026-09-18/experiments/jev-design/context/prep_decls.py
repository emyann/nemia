import json,subprocess,re,glob,os,statistics as st
REPO='/home/yrnd1/projects/hkb-v2'
runs={}
for f in glob.glob(os.path.expanduser('~/.agent-workflows/runs/*.json')):
    r=json.load(open(f)); runs[r['id']]=r
fd=json.load(open('files_dataset.json'))
def git(*a): return subprocess.run(['git','-C',REPO,*a],capture_output=True,text=True,errors='replace').stdout
DECL=re.compile(r'^(?:export )?(?:async )?(?:function\*? |const |type |interface |class )(\w+)')
FILES=['packages/agent-workflows/src/run.ts','packages/agent-workflows/src/runner.ts']
out=[]
for x in fd:
    r=runs[x['id']]; base=r['baseRef']
    for F in FILES:
        if F not in x['truth']: continue
        src=git('show',f'{base}:{F}').split('\n')
        starts=[(i,DECL.match(l).group(1)) for i,l in enumerate(src) if DECL.match(l)]
        decls=[]
        for j,(i,name) in enumerate(starts):
            end=(starts[j+1][0]-1) if j+1<len(starts) else len(src)-1
            # doc comment above
            k=i-1; doc=''
            if k>=0 and src[k].strip().endswith('*/'):
                s=k
                while s>0 and '/**' not in src[s]: s-=1
                doc=re.sub(r'\s+',' ',' '.join(re.sub(r'^\s*/?\*+/?','',l) for l in src[s:k+1])).strip()
                start=s
            else: start=i
            decls.append({'name':name,'start':start+1,'end':end+1,'lines':end-start+1,'doc':doc[:200],'body':'\n'.join(src[start:end+1])})
        # fix ends: a decl ends where the next decl's doc starts
        for j in range(len(decls)-1): decls[j]['end']=decls[j+1]['start']-1; decls[j]['lines']=decls[j]['end']-decls[j]['start']+1
        touched=set()
        for sha in (r.get('tips') or {}).values():
            for l in git('diff','-U0',f'{base}...{sha}','--',F).split('\n'):
                m=re.match(r'^@@ -(\d+)(?:,(\d+))? ',l)
                if m:
                    a=int(m.group(1)); b=int(m.group(2) or 1)
                    lo,hi=(a,a+b-1) if b>0 else (a,a)
                    for d in decls:
                        if d['start']<=hi and lo<=d['end']: touched.add(d['name'])
        brief=x['brief']; syms=set(s.split('(')[0].strip() for s in re.findall(r'`([^`\n]{3,60})`',brief))
        base_score={}
        for d in decls:
            sc=5.0 if re.search(r'\b'+re.escape(d['name'])+r'\b',brief) else 0.0
            sc+=sum(1 for s in syms if len(s)>=4 and s in d['body'])
            base_score[d['name']]=sc
        names=[d['name'] for d in decls]
        if len(set(names))!=len(names):  # dedupe overloaded names
            seen=set(); decls=[d for d in decls if not (d['name'] in seen or seen.add(d['name']))]
        out.append({'id':x['id'],'file':F,'brief':brief,'file_lines':len(src),'decls':[{k:v for k,v in d.items() if k!='body'} for d in decls],'truth':sorted(touched),'baseline':base_score})
json.dump(out,open('decls_dataset.json','w'))
print(len(out),'(run,file) pairs; median decls',st.median(len(o['decls']) for o in out),'median touched',st.median(len(o['truth']) for o in out),'median file lines',st.median(o['file_lines'] for o in out))
print('median share of file lines inside touched decls',st.median(sum(d['lines'] for d in o['decls'] if d['name'] in o['truth'])/o['file_lines'] for o in out))
