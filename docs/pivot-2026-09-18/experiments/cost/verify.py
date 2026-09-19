import json,os,re,collections,io,contextlib
import importlib.util
tasks=os.path.expanduser('~/.agent-workflows/engine/tasks/')
def filed(name):
    t=re.match(r'ae/(.+)/\d+$',name).group(1)
    try:
        for l in open(tasks+t+'.jsonl'):
            e=json.loads(l)
            if e['kind']=='filed': return e
    except FileNotFoundError: return None
# reuse resume.py's boundary list
src=open('resume.py').read().split("out.sort")[0]
g={}
exec(src,g)
tab=collections.Counter(); tok=collections.Counter()
odd=[]
for r in g['out']:
    a,b=filed(r['frm']),filed(r['to'])
    if not a or not b: tab['unknown']+=1; continue
    same=all(json.dumps(a.get(k),sort_keys=True)==json.dumps(b.get(k),sort_keys=True) for k in('closeoutSchema','tools','disallowedTools','model','permissionMode','effort','mcp'))
    schema_same=json.dumps(a.get('closeoutSchema'),sort_keys=True)==json.dumps(b.get('closeoutSchema'),sort_keys=True)
    cold=r['cw']>0.5*r['prev_ctx']
    key=('schema same' if schema_same else 'schema CHANGED','cold' if cold else 'warm')
    tab[key]+=1; tok[key]+=r['cw']
    if (schema_same and cold) or (not schema_same and not cold): odd.append((r['to'],round(r['gap'],1),r['prev_ctx'],r['cw'],r['cr'],same))
for k,v in sorted(tab.items(),key=str): print(k,v,'tokens written',tok[k])
print('exceptions:')
for o in odd: print(' ',o)
