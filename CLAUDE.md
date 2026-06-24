# Claude Instructions

Work on the `main` branch of `./proxies-at-home`.

Before making any changes, run:

```
cd ./proxies-at-home
git branch --show-current
```

If the current branch is not `main`, stop immediately and tell me. Do not edit files, run formatters, install packages, or make commits on any other branch.

Only modify files under `./proxies-at-home`.
`./silhouette-card-maker` is reference material only.
Never edit files in that repository.

Avoid reading:
- node_modules
- dist
- build
- .svelte-kit
- .next
- out
- coverage
- release
- package-lock.json
- pnpm-lock.yaml
- yarn.lock

Use rg before opening files.
Read specific functions and sections instead of entire files.
