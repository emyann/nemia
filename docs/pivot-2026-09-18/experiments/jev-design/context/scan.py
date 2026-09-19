import json,glob,os,re,sys
L=json.load(open('trap_labels.json'))['traps']
RX={k:[re.compile(p) for p in v['all']] for k,v in L.items()}
ds=json.load(open('dataset.json'))
P=os.path.expanduser('~/.claude/projects/')
out={}
for r in ds:
    dirs=glob.glob(P+'-home-yrnd1--agent-workflows-worktrees-'+r['id']+'-*')
    if not dirs: continue
    hits={k:0 for k in RX}; sessions=[]
    for d in dirs:
      for f in sorted(glob.glob(d+'/*.jsonl'),key=os.path.getmtime):
        calls=set(); pre_chars=0; total_chars=0; edited=False; calls_after=0; reads={}; pending={}; first_ts=None; bytool={}
        for line in open(f,errors='replace'):
            try: o=json.loads(line)
            except: continue
            m=o.get('message') or {}
            c=m.get('content')
            if first_ts is None: first_ts=o.get('timestamp')
            if o.get('type')=='assistant' and isinstance(c,list):
                mid=m.get('id')
                if mid not in calls:
                    calls.add(mid)
                    if edited: calls_after+=1
                for b in c:
                    if b.get('type')=='tool_use':
                        s=json.dumps(b.get('input'))
                        for k,rs in RX.items():
                            if all(x.search(s) for x in rs): hits[k]+=1
                        pending[b['id']]=(b['name'],(b.get('input') or {}).get('file_path'))
                        if b['name'] in('Edit','Write','NotebookEdit'): edited=True
            elif o.get('type')=='user' and isinstance(c,list):
                for b in c:
                    if b.get('type')=='tool_result':
                        cc=b.get('content'); n=(len(cc) if isinstance(cc,str) else sum(len(x.get('text','')) if x.get('type')=='text' else 6000 for x in (cc or []) if isinstance(x,dict)))
                        total_chars+=n
                        if not edited: pre_chars+=n
                        name,fp=pending.get(b.get('tool_use_id'),('?',None))
                        bytool[name]=bytool.get(name,0)+n
                        if name=='Read' and fp: reads[fp]=reads.get(fp,0)+n
        sessions.append({'file':os.path.basename(f),'start':first_ts,'calls':len(calls),'calls_after_first_edit':calls_after,'pre_edit_result_chars':pre_chars,'result_chars':total_chars,'bytool':bytool,'reads':reads})
    out[r['id']]={'hits':hits,'sessions':sessions}
json.dump(out,open('scan.json','w'))
print(len(out),'runs with transcripts')
