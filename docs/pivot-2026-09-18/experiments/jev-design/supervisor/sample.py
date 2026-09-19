import json,sys,re,collections
p=sys.argv[1]
DEC=re.compile(r'\bwf (approve|retry|say|cancel|start|rm|inbox)\b|git merge|kill |pkill')
ev=[]
first=None;n=0;usage=collections.Counter()
for line in open(p):
    n+=1
    try:o=json.loads(line)
    except: continue
    m=o.get('message') or {}
    if o.get('type')=='user' and first is None and isinstance(m.get('content'),str): first=m['content'][:600]
    if o.get('type')=='assistant':
        u=m.get('usage') or {}
        for k in ('input_tokens','cache_read_input_tokens','cache_creation_input_tokens','output_tokens'): usage[k]+=u.get(k,0)
        usage['calls']+=1
        for c in m.get('content') or []:
            if c.get('type')=='tool_use':
                i=c['input']; name=c['name']
                s=i.get('command') or i.get('file_path') or json.dumps(i)[:300]
                ev.append((o.get('timestamp','')[:19],name,s))
    elif o.get('type')=='user' and isinstance(m.get('content'),str):
        ev.append((o.get('timestamp','')[:19],'USER',m['content'][:300]))
print('lines',n,'first:',first); print(dict(usage))
for idx,(t,name,s) in enumerate(ev):
    if name=='AskUserQuestion' or (name=='Bash' and DEC.search(s)):
        print('\n###',t,name,s[:400].replace('\n',' | '))
        for (t2,n2,s2) in ev[max(0,idx-6):idx]:
            print('     before:',n2,s2[:140].replace('\n',' | '))
