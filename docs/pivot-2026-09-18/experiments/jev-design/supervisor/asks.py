import json,sys,glob
out=[]
for p in glob.glob('/home/yrnd1/.claude/projects/-home-yrnd1-projects-hkb-v2/*.jsonl'):
    pend={}
    for line in open(p):
        try:o=json.loads(line)
        except: continue
        m=o.get('message') or {}
        c=m.get('content')
        if not isinstance(c,list): continue
        for b in c:
            if b.get('type')=='tool_use' and b['name']=='AskUserQuestion':
                pend[b['id']]=(o.get('timestamp'),b['input'])
            if b.get('type')=='tool_result' and b.get('tool_use_id') in pend:
                t,i=pend.pop(b['tool_use_id'])
                r=b.get('content'); 
                if isinstance(r,list): r=' '.join(x.get('text','') for x in r)
                out.append({'session':p[-42:-6],'at':t,'questions':i.get('questions'),'answer':r})
out.sort(key=lambda x:x['at'])
json.dump(out,open('operator-asks.json','w'),indent=1)
print(len(out))
for a in out:
    for q in a['questions']:
        print('\n##',a['at'][:16],a['session'][:8]); print('Q:',q['question'][:500]); print('OPTS:',[o['label'] for o in q.get('options',[])])
    print('A:',str(a['answer'])[:400])
