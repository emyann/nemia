---
waitsFor:
  - "${{ case(parameters.github, 'turn', '') }}"
  - "${{ case(parameters.github, 'ci', '') }}"
  - landed
  - "${{ case(parameters.github, 'base-ci', '') }}"
---
