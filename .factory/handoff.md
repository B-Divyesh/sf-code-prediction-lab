# Code Prediction Lab — build handoff

Date: 2026-08-28 · Work order: `code-prediction-lab-build-1` · Artifact: container (`PORT=8080`)

## What shipped

- A finished prediction-first learning flow: select/edit a tiny JavaScript or Python specimen, write a required prediction, execute it, compare the observation, reflect, save locally, and export a reproducible Markdown receipt.
- Six guided exercises with explanations and pinned runtime labels.
- Rust/axum backend with an in-memory SQLite exercise catalog, `/health`, `/api/exercises`, and `/api/run`.
- Fresh non-root subprocess per run, clean environment, 2-second wall/CPU caps, 8 KB code and 16 KB output caps, 64 MB JavaScript heap cap, 1 GB address-space cap, file-descriptor limit, no-new-privileges, eight-run concurrency ceiling, JavaScript VM without host bindings, and Python builtins/audit restrictions. Code and output are not persisted server-side.
- Local-only receipt archive, delete confirmation, offline shell/draft state, execution errors, empty archive, loading feedback, and `Ctrl/⌘ + Enter` run shortcut.
- $29 one-time Field Kit unlock through the Sociobot billing contract: hosted checkout, return-token capture and URL cleanup, local token storage, daily cached verification, optimistic offline unlock, inactive-license notice, restore field, and a working custom-specimen maker.
- `/privacy` and `/terms` routes describing local storage, runner processing, billing, refunds, and acceptable use.
- A responsive botanical field-guide system with light/dark treatments, reduced motion, 44 px controls, visible focus, semantic landmarks, and one h1 per route.
- Original hero art generated for the product and reviewed, with exact prompt/provenance in `.factory/design.md` and `assets/src/field-guide-hero.prompt.json`. Production AVIF/WebP/JPEG variants range from 26–103 KB.
- Multi-stage, non-root Docker image with Node 22 / Alpine 3.20 and Python 3.12, structured JSON logs, graceful shutdown, security headers, and health check.

## Run and verify

```sh
npm ci
npm run build
npm test
npm run test:e2e
cargo build --release
PORT=8080 STATIC_DIR=dist ./target/release/code-prediction-lab
```

Container build command:

```sh
docker build --build-arg BUILD_SHA="$(git rev-parse --short HEAD)" -t code-prediction-lab .
docker run --rm -p 8080:8080 code-prediction-lab
```

The worker image did not contain a Docker daemon/client, so the Dockerfile was reviewed but not executed here. Both build stages were independently executed locally (`npm run build`, `cargo build --release`).

## Verification evidence

- `npm test`: 2 frontend contract tests and 3 Rust route tests passed.
- `npm run test:e2e`: 5 passed, 1 expected desktop skip. Desktop and 390 × 844 mobile cover prediction gating, a real JavaScript run, reflection, local save, navigation, exercise switching, and four-route axe scans.
- axe WCAG 2 A/AA scan: 0 serious or critical violations on `/`, `/lab`, `/privacy`, and `/terms` in desktop and mobile Chromium.
- Lighthouse mobile on the release server: Performance **100**, Accessibility **100**, Best Practices **100**, SEO **100**; LCP **1.8 s**, CLS **0**, TBT **0 ms**, Speed Index **1.1 s**.
- Bundle: initial JavaScript **27.58 KB** (10.47 KB gzip), CSS **21.52 KB** (5.71 KB gzip), HTML **0.76 KB**. Largest hero candidate **103 KB**; mobile AVIF **26 KB**.
- Load smoke: 100 concurrent `/health` requests, **100/100 HTTP 200**.
- Sandbox smoke: JavaScript and Python happy paths passed; Python file access was denied; an infinite JavaScript loop was stopped in **1.55 s** with a controlled timeout response.
- `npm audit`: 0 vulnerabilities.
- `git diff --check`: clean.

## Known gaps and deployment notes

- This repository cannot itself start a nested container for every run. V1 uses a fresh, capped interpreter process inside the non-root service container. Production should apply the documented second boundary at orchestration: read-only root filesystem, dropped capabilities, seccomp/AppArmor, PID/memory quotas, and disabled egress for the deployment. For hostile multi-tenant classroom workloads, move `/api/run` to disposable microVM/container workers before broad release.
- Per-IP request throttling belongs at the deployment edge; the application enforces eight concurrent runs and strict per-run limits.
- Long-term “rerun after one month” success depends on retaining the pinned Node 22 / Python 3.12 container tag. Receipts contain the exact family/runtime label and all run limits, but not an immutable image digest until deployment supplies it.
- Billing defaults to the production Sociobot API. Set `VITE_BILLING_API=https://pilot-api.sociobot.in` for staging before `npm run build`; the factory still needs to register the paid product and return URL.
