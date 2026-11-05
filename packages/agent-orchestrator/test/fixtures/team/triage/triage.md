---
place: git
after: plan
input: plan
# A condition: no agent, no workspace; its table reads the fact plan signed.
routes: [web, backend, docs]
route: { from: plan.surface, table: { web: web, backend: backend, docs: docs } }
# A change to the docs alone ends the run here.
ends: [docs]
---
Send the change to the surface it is on.
