# Code Prediction Lab

Code Prediction Lab is a prediction-first learning utility for people learning JavaScript or Python with an LLM nearby. Instead of showing an answer, it asks the learner to commit to an exact output and a reason, runs the tiny specimen in a constrained process, then saves the prediction, observation, explanation, and runtime metadata as a portable Markdown receipt.

Live product: <https://code-prediction-lab.sociobot.in>

## What v1 includes

- Six guided JavaScript and Python experiments.
- Prediction gate before every run.
- Fresh subprocesses with a 2-second CPU/wall limit, 8 KB code limit, 16 KB output limit, 64 MB Node heap limit, clean environment, no persistence, and language-level filesystem/network/process restrictions.
- Runtime, limits, duration, and run ID on each observation.
- Local-only field-note archive and free Markdown export.
- Offline shell and read-only drafting when the runner is unavailable.
- Optional $29 one-time Field Kit license for creating custom local specimens, verified through the Sociobot billing API.
- Light and dark botanical field-guide treatments, keyboard shortcuts, reduced motion, and a 390 px mobile layout.

The server does not retain learner code, predictions, or results. SQLite is used as an in-memory, read-only-at-runtime exercise catalog; personal artifacts remain in browser `localStorage`.

## Develop

Requirements: Node.js 22+, npm 10+, Rust 1.89+, Python 3.12+, and Cargo.

```sh
npm ci
npm run build
PORT=8080 STATIC_DIR=dist cargo run
```

Open <http://localhost:8080>. For split frontend/backend development, run `npm run dev` and `npm run dev:server` in separate terminals.

## Test and verify

```sh
npm test            # TypeScript/static tests + Rust route tests
npm run test:e2e    # Chromium desktop/mobile flow + axe WCAG checks
npm run build       # reproducible frontend output in dist/
cargo build --release
```

The Playwright dependency is pinned to 1.58.2, matching the factory browser image.

## Container

```sh
docker build --build-arg BUILD_SHA="$(git rev-parse --short HEAD)" -t code-prediction-lab .
docker run --rm -p 8080:8080 code-prediction-lab
```

The multi-stage image builds the Vite frontend and Rust server separately, then runs the server as a non-root user with pinned Node 22 / Alpine 3.20 and Python 3.12 runtimes. Configuration is environment-only:

- `PORT` — HTTP port, default `8080`
- `STATIC_DIR` — frontend build directory, default `dist`
- `RUST_LOG` — structured log filter
- `VITE_BILLING_API` — billing origin at frontend build time, default `https://api.sociobot.in`; staging may use `https://pilot-api.sociobot.in`

`GET /health` reports status, build SHA, and available runtimes.

## Security model

Runs happen in a new non-root subprocess inside the application container. The Rust parent clears the environment, applies address-space/CPU/file-descriptor and no-new-privileges limits, caps concurrent runs at eight, truncates output, and tears down the process after two seconds. JavaScript receives a `node:vm` context without `process`, `require`, dynamic code generation, or WebAssembly. Python receives an isolated interpreter with a small builtin allowlist and audit hooks that block files, sockets, subprocesses, and native loading.

This is defense in depth for tiny educational snippets, not a general-purpose hosted IDE. A deployment should additionally apply container-level seccomp/AppArmor, read-only filesystems, disabled egress, PID limits, and per-IP edge rate limits.

## Product sources

- [Researched brief](.factory/brief.json)
- [Visual thesis and asset provenance](.factory/design.md)
- [Build handoff](.factory/handoff.md)
- [Privacy policy](https://code-prediction-lab.sociobot.in/privacy)
- [Terms](https://code-prediction-lab.sociobot.in/terms)

Licensed under the MIT License. Original generated artwork provenance is documented in `.factory/design.md` and `assets/src/field-guide-hero.prompt.json`.
