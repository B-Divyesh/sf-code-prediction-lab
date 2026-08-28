import "./style.css";
import bundledExercises from "./exercises.json";

type Exercise = {
  id: string; number: number; language: "javascript" | "python"; runtime: string;
  title: string; question: string; code: string; concept: string; explanation: string;
  custom?: boolean;
};
type RunResult = {
  ok: boolean; stdout: string; stderr: string; exit_code: number | null; duration_ms: number;
  runtime: string; run_id: string;
  limits: { timeout_ms: number; max_code_bytes: number; max_output_bytes: number; network: string; persistence: string };
};
type Receipt = {
  id: string; createdAt: string; exerciseId: string; title: string; language: string; runtime: string;
  code: string; prompt: string; prediction: string; stdout: string; stderr: string; status: "matched" | "close" | "surprised" | "unmarked";
  explanation: string; learnerNote: string; durationMs: number; limits: RunResult["limits"];
};
type LicenseCache = { valid: boolean; checkedAt: number; reason?: string };

const app = document.querySelector<HTMLDivElement>("#app")!;
const BILLING_BASE = import.meta.env.VITE_BILLING_API || "https://api.sociobot.in";
const SLUG = "code-prediction-lab";
const RECEIPTS_KEY = "cpl:receipts:v1";
const CUSTOM_KEY = "cpl:custom:v1";
const LICENSE_KEY = `sb_license:${SLUG}`;
const LICENSE_CACHE_KEY = `${LICENSE_KEY}:verdict`;

let exercises: Exercise[] = [...(bundledExercises as Exercise[]), ...readJson<Exercise[]>(CUSTOM_KEY, [])];
let current = exercises[0];
let result: RunResult | null = null;
let running = false;
let apiAvailable = navigator.onLine;
let licenseValid = readJson<LicenseCache | null>(LICENSE_CACHE_KEY, null)?.valid === true;
let licenseNotice = Boolean(localStorage.getItem(LICENSE_KEY)) && readJson<LicenseCache | null>(LICENSE_CACHE_KEY, null)?.valid === false;

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) || "") as T; } catch { return fallback; }
}
function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}
function icon(name: "leaf" | "check" | "run" | "save" | "download" | "lock" | "wifi"): string {
  const paths = {
    leaf: '<path d="M20 4C10 5 5 11 6 20c8 1 14-4 14-16Z"/><path d="M5 22c3-6 7-10 13-14"/>',
    check: '<path d="m5 13 4 4L19 7"/>', run: '<path d="m9 6 9 6-9 6V6Z"/>',
    save: '<path d="M5 4h12l2 2v14H5V4Z"/><path d="M8 4v6h7V4M8 20v-6h8v6"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M5 20h14"/>',
    lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    wifi: '<path d="M4 9a12 12 0 0 1 16 0M7 13a8 8 0 0 1 10 0m-7 4a3 3 0 0 1 4 0"/>'
  };
  return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
}

function shell(content: string, route: string): string {
  const nav = [["/", "Guide"], ["/lab", "Lab"], ["/archive", "Archive"], ["/field-kit", "Field kit"]];
  return `<header class="masthead">
    <a class="brand" href="/" data-route="/" aria-label="Code Prediction Lab home">${icon("leaf")}<span>Code Prediction Lab</span><small>FIELD GUIDE 01</small></a>
    <nav aria-label="Primary"><button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button><div id="site-nav" class="nav-links">${nav.map(([href,label]) => `<a href="${href}" data-route="${href}" ${route === href ? 'aria-current="page"' : ""}>${label}</a>`).join("")}</div></nav>
    <span class="connection ${apiAvailable ? "online" : "offline"}" title="${apiAvailable ? "Runner available" : "Runner unavailable"}">${icon("wifi")}<span>${apiAvailable ? "Runner ready" : "Offline notes"}</span></span>
  </header>${licenseNotice ? `<div class="license-notice" role="status">License no longer active. <a href="/field-kit" data-route="/field-kit">Review Field Kit options</a>.</div>` : ""}<main id="main" tabindex="-1">${content}</main>
  <footer><div><span class="footer-mark">CPL · 01</span><p>Observe code like a field scientist. Your work stays in this browser.</p></div><nav aria-label="Legal"><a href="/privacy" data-route="/privacy">Privacy</a><a href="/terms" data-route="/terms">Terms</a></nav><p class="provenance">Original AI-generated field-guide artwork · no tracking</p></footer>`;
}

function route(): string { return location.pathname === "/index.html" ? "/" : location.pathname; }
function render(): void {
  const path = route();
  const content = path === "/lab" ? labPage() : path === "/archive" ? archivePage() : path === "/field-kit" ? fieldKitPage() : path === "/privacy" ? privacyPage() : path === "/terms" ? termsPage() : homePage();
  app.innerHTML = shell(content, path);
  bindPage(path);
}

function homePage(): string {
  return `<section class="hero"><div class="hero-copy"><p class="eyebrow">A field guide for curious programmers</p><h1>Think first.<br><em>Then</em> run the code.</h1><p class="lede">Turn tiny snippets into lasting knowledge: commit to a prediction, observe a contained run, explain the difference, and keep the evidence.</p><div class="hero-actions"><a class="button primary" href="/lab" data-route="/lab">Start an experiment <span aria-hidden="true">→</span></a><a class="text-link" href="#method">See the method</a></div><p class="privacy-note">No account. No server history. Your field notes live in this browser.</p></div>
  <figure class="hero-art"><picture><source type="image/avif" srcset="/assets/field-guide-hero-640.avif 640w, /assets/field-guide-hero-1024.avif 1024w" sizes="(max-width: 760px) 92vw, 48vw"><source type="image/webp" srcset="/assets/field-guide-hero-640.webp 640w, /assets/field-guide-hero-1024.webp 1024w" sizes="(max-width: 760px) 92vw, 48vw"><img src="/assets/field-guide-hero-1024.jpg" width="1024" height="683" fetchpriority="high" decoding="async" alt="An open botanical field notebook where a fern branches from code-like marks into pinned observations"></picture><figcaption>PLATE I · From hypothesis to observation</figcaption></figure></section>
  <section class="method" id="method" aria-labelledby="method-title"><div class="section-intro"><p class="eyebrow">The observation loop</p><h2 id="method-title">Four moves. One honest lesson.</h2><p>Reading an answer feels fluent. Predicting makes the gap visible.</p></div><ol class="method-list"><li><span>01</span><h3>Inspect</h3><p>Read one small specimen and name the concept in play.</p></li><li><span>02</span><h3>Predict</h3><p>Write the exact output and why. Running stays locked until you do.</p></li><li><span>03</span><h3>Observe</h3><p>Run in a fresh, capped process with the runtime disclosed.</p></li><li><span>04</span><h3>Preserve</h3><p>Explain the gap and export a reproducible Markdown receipt.</p></li></ol></section>
  <section class="specimen-preview" aria-labelledby="specimen-title"><div><p class="eyebrow">Six free specimens</p><h2 id="specimen-title">Small enough to reason about.</h2><p>JavaScript and Python exercises cover coercion, closures, aliasing, slicing, task order, and defaults.</p><a class="button secondary" href="/lab" data-route="/lab">Open specimen 01</a></div><div class="preview-code" aria-label="Example code specimen"><span>SPECIMEN · JAVASCRIPT</span><pre><code>const value = 1 + 2 + "3";
console.log(value, typeof value);</code></pre><p>What exact value and type will be printed?</p></div></section>`;
}

function labPage(): string {
  if (!current) current = exercises[0];
  const langLabel = current.language === "javascript" ? "JavaScript" : "Python";
  return `<section class="lab-head"><div><p class="eyebrow">Specimen ${String(current.number).padStart(2,"0")} of ${String(exercises.length).padStart(2,"0")}</p><h1>Prediction lab</h1><p>Do not run yet. First, make a claim you can prove wrong.</p></div><div class="runtime-tag"><span class="status-dot"></span><div><small>Pinned runtime</small><strong>${escapeHtml(current.runtime)}</strong></div></div></section>
  <div class="lab-layout"><aside class="specimen-index" aria-label="Exercise index"><h2>Specimen index</h2><ol>${exercises.map(ex => `<li><button type="button" data-exercise="${ex.id}" ${ex.id === current.id ? 'aria-current="true"' : ""}><span>${String(ex.number).padStart(2,"0")}</span><span>${escapeHtml(ex.title)}<small>${escapeHtml(ex.language)} · ${escapeHtml(ex.concept)}</small></span></button></li>`).join("")}</ol></aside>
  <form id="experiment-form" class="experiment" novalidate><label class="mobile-picker" for="exercise-select">Choose a specimen</label><select class="mobile-picker" id="exercise-select">${exercises.map(ex => `<option value="${ex.id}" ${ex.id === current.id ? "selected" : ""}>${String(ex.number).padStart(2,"0")} · ${escapeHtml(ex.title)}</option>`).join("")}</select>
    <section class="trail-section specimen"><div class="trail-marker">01</div><div class="trail-content"><div class="section-label"><span>SPECIMEN · ${langLabel.toUpperCase()}</span><span>${escapeHtml(current.concept)}</span></div><h2>${escapeHtml(current.title)}</h2><p class="question">${escapeHtml(current.question)}</p><label for="code">Code specimen</label><textarea id="code" name="code" class="code-editor" spellcheck="false" maxlength="8000" aria-describedby="code-help">${escapeHtml(current.code)}</textarea><div id="code-help" class="field-help"><span>Editable · max 8 KB</span><button type="button" class="plain-button" id="reset-code">Reset specimen</button></div></div></section>
    <section class="trail-section prediction"><div class="trail-marker">02</div><div class="trail-content"><div class="section-label"><span>PREDICTION · REQUIRED</span><span id="prediction-count">0 characters</span></div><h2>What do you expect?</h2><label for="prediction">Write the exact output and your reason</label><textarea id="prediction" name="prediction" rows="5" required minlength="3" aria-describedby="prediction-help" placeholder="I predict… because…"></textarea><p id="prediction-help" class="field-help">Your prediction is saved only when you preserve the field note.</p></div></section>
    <section class="trail-section observation"><div class="trail-marker">03</div><div class="trail-content"><div class="section-label"><span>OBSERVATION · CONTAINED RUN</span><span>2 s · 16 KB output</span></div><h2>Put the claim to the test.</h2><p>Each run starts fresh. The runner receives no account data and retains no code.</p>${!apiAvailable ? `<div class="state-callout warning" role="status"><strong>Runner unavailable</strong><span>Your draft is safe in this tab. Reconnect to make an observation.</span></div>` : ""}<button class="button run-button" type="submit" id="run" disabled>${icon("run")}<span>Record a prediction to run</span><kbd>⌘/Ctrl ↵</kbd></button><div id="run-status" class="sr-only" aria-live="polite"></div><div id="result">${result ? resultMarkup(result) : `<div class="empty-result"><span class="empty-glyph">?</span><p>The observed output will be pinned here after you run.</p></div>`}</div></div></section>
    <section class="trail-section field-note ${result ? "revealed" : "pending"}" id="field-note"><div class="trail-marker">04</div><div class="trail-content"><div class="section-label"><span>FIELD NOTE · REFLECT</span><span>${result ? "Ready to preserve" : "Run first"}</span></div><h2>Explain what changed in your model.</h2>${result ? noteFields() : `<p class="locked-note">Make a prediction and observe the result to reveal the explanation.</p>`}</div></section>
  </form></div>`;
}

function resultMarkup(run: RunResult): string {
  const output = [run.stdout, run.stderr].filter(Boolean).join(run.stdout && run.stderr ? "\n" : "") || "(no output)";
  return `<article class="result-sheet ${run.ok ? "success" : "error"}" aria-labelledby="result-title"><header><div><span class="result-status">${run.ok ? `${icon("check")} Run completed` : "! Run stopped with an error"}</span><h3 id="result-title">Observed output</h3></div><span>${run.duration_ms} ms</span></header><pre tabindex="0"><code>${escapeHtml(output)}</code></pre><dl><div><dt>Runtime</dt><dd>${escapeHtml(run.runtime)}</dd></div><div><dt>Process</dt><dd>${escapeHtml(run.limits.persistence)}</dd></div><div><dt>Network</dt><dd>${escapeHtml(run.limits.network)}</dd></div><div><dt>Run ID</dt><dd>${escapeHtml(run.run_id.slice(0,8))}</dd></div></dl></article>`;
}

function noteFields(): string {
  return `<fieldset><legend>How close was your prediction?</legend><div class="outcome-options"><label><input type="radio" name="outcome" value="matched"><span>${icon("check")}Matched</span></label><label><input type="radio" name="outcome" value="close"><span>≈ Close</span></label><label><input type="radio" name="outcome" value="surprised"><span>! Surprised</span></label></div></fieldset><details class="guide-explanation"><summary>Compare with the guide’s explanation</summary><p>${escapeHtml(current.explanation)}</p></details><label for="learner-note">What will you remember next time?</label><textarea id="learner-note" rows="4" placeholder="The rule I was missing was…"></textarea><div class="save-row"><button type="button" class="button primary" id="save-receipt">${icon("save")} Save field note</button><span>Stored locally. Markdown export stays free.</span></div>`;
}

function archivePage(): string {
  const receipts = readJson<Receipt[]>(RECEIPTS_KEY, []);
  return `<section class="page-head"><p class="eyebrow">Local specimen cabinet</p><h1>Your field notes</h1><p>Runs preserved in this browser, newest first. Export any note as portable Markdown.</p></section>${receipts.length ? `<section class="archive-list" aria-label="Saved field notes">${receipts.map((r,index) => `<article class="receipt-card"><div class="receipt-index">${String(receipts.length-index).padStart(2,"0")}</div><div><p class="receipt-meta"><span>${escapeHtml(r.language)}</span><time datetime="${r.createdAt}">${new Date(r.createdAt).toLocaleString()}</time></p><h2>${escapeHtml(r.title)}</h2><p class="receipt-prediction">“${escapeHtml(r.prediction)}”</p><dl><div><dt>Outcome</dt><dd>${escapeHtml(r.status)}</dd></div><div><dt>Runtime</dt><dd>${escapeHtml(r.runtime)}</dd></div></dl><div class="receipt-actions"><button class="button small" type="button" data-download="${r.id}">${icon("download")} Export Markdown</button><button class="plain-button danger" type="button" data-delete="${r.id}">Delete</button></div></div></article>`).join("")}</section>` : `<section class="empty-archive"><div class="pressed-leaf" aria-hidden="true">⌁</div><h2>The cabinet is empty.</h2><p>Complete an experiment and save its field note. Nothing is sent to an account or cloud.</p><a class="button primary" href="/lab" data-route="/lab">Start specimen 01</a></section>`}`;
}

function fieldKitPage(): string {
  return `<section class="page-head kit-head"><p class="eyebrow">Optional paid unlock</p><h1>Build your own field kit.</h1><p>The six guided specimens, local archive, and every Markdown export are free. The Field Kit adds custom experiments for learners who want to bring their own snippets.</p></section><section class="kit-sheet"><div class="kit-price"><span>ONE-TIME LICENSE</span><strong><sup>$</sup>29</strong><p>No subscription</p></div><div class="kit-details"><h2>${licenseValid ? "Field Kit is active" : "Custom specimen maker"}</h2><ul><li>${icon("check")} Create unlimited JavaScript and Python specimens</li><li>${icon("check")} Keep the same prediction-first workflow and runtime receipts</li><li>${icon("check")} Use your license on another personal device</li></ul>${licenseValid ? customForm() : `<a class="button primary" href="${BILLING_BASE}/api/v1/products/${SLUG}/checkout">Buy the Field Kit</a><p class="merchant-note">Secure checkout is hosted by Sociobot/Dodo, the merchant of record. Refunds revoke the license.</p>`}</div></section><section class="restore"><div><h2>Already purchased?</h2><p>Paste the license token from your receipt. Verification never blocks the free lab.</p></div><form id="license-form"><label for="license">License token</label><div><input id="license" name="license" autocomplete="off" required><button class="button secondary" type="submit">Verify license</button></div><p id="license-status" role="status" aria-live="polite"></p></form></section><p class="legal-line">By purchasing, you agree to the <a href="/terms" data-route="/terms">terms</a>. See how license data is handled in <a href="/privacy" data-route="/privacy">privacy</a>.</p>`;
}

function customForm(): string {
  return `<form id="custom-form" class="custom-form"><label for="custom-title">Specimen title</label><input id="custom-title" required maxlength="80"><label for="custom-language">Language</label><select id="custom-language"><option value="javascript">JavaScript</option><option value="python">Python</option></select><label for="custom-question">Prediction prompt</label><input id="custom-question" required maxlength="180" value="What exact output will this code produce, and why?"><label for="custom-code">Code</label><textarea id="custom-code" class="code-editor" required maxlength="8000" rows="7"></textarea><button class="button primary" type="submit">Create and open specimen</button><p id="custom-status" role="status"></p></form>`;
}

function privacyPage(): string { return legalPage("Privacy", "Last updated 28 August 2026", `<h2>The short version</h2><p>Your code, predictions, reflections, and saved receipts stay in your browser by default. The run service receives code only to execute the run and discards the process immediately afterward.</p><h2>Data this app handles</h2><ul><li><strong>Experiment runs:</strong> code and language are sent over HTTPS to the runner. They are not written to the application database or logs. Operational logs contain request metadata, status, and timing—not request bodies.</li><li><strong>Local field notes:</strong> receipts, custom specimens, and license tokens use your browser’s local storage. Clearing site data removes them.</li><li><strong>Licenses:</strong> a token is sent to Sociobot’s billing API for verification at most once per day. Payment details are handled by Sociobot/Dodo and never reach this app.</li></ul><h2>Tracking and retention</h2><p>There are no analytics, advertising cookies, fingerprinting scripts, or third-party fonts. The service may retain short-lived infrastructure access logs for reliability and abuse prevention.</p><h2>Your choices</h2><p>Export field notes before clearing browser storage. You can delete individual notes from the archive. Do not submit secrets or personal data as code.</p>`); }
function termsPage(): string { return legalPage("Terms", "Effective 28 August 2026", `<h2>Use of the lab</h2><p>Code Prediction Lab is an educational utility, not a production IDE. Run only code you are permitted to use. Do not attempt to escape limits, disrupt the service, or process sensitive information.</p><h2>Free and paid features</h2><p>The guided lab, local archive, and Markdown exports are free. The $29 Field Kit is a one-time personal license for the custom specimen maker. Sociobot/Dodo is the merchant of record and handles checkout and refunds. A refunded, expired, revoked, or wrong-product license is locked automatically.</p><h2>Availability and warranties</h2><p>The service is provided “as is.” Runtime versions are disclosed on each receipt, but generated output may still differ across platforms or future runtime updates. Keep exported receipts for long-term records.</p><h2>Acceptable experiments</h2><p>Resource limits are part of the product. Runs are capped and may be stopped. We may block abusive traffic to keep the shared runner available.</p><h2>Contact</h2><p>Questions about this product can be sent through the support channel shown on sociobot.in.</p>`); }
function legalPage(title: string, date: string, body: string): string { return `<article class="legal"><p class="eyebrow">Code Prediction Lab · policy</p><h1>${title}</h1><p class="legal-date">${date}</p>${body}<p><a class="text-link" href="/" data-route="/">← Return to the field guide</a></p></article>`; }

function bindPage(path: string): void {
  document.querySelectorAll<HTMLAnchorElement>("a[data-route]").forEach(link => link.addEventListener("click", event => { event.preventDefault(); navigate(link.dataset.route!); }));
  document.querySelector<HTMLButtonElement>(".nav-toggle")?.addEventListener("click", event => { const button = event.currentTarget as HTMLButtonElement; button.setAttribute("aria-expanded", String(button.getAttribute("aria-expanded") !== "true")); });
  if (path === "/lab") bindLab();
  if (path === "/archive") bindArchive();
  if (path === "/field-kit") bindFieldKit();
}

function navigate(path: string): void { history.pushState({}, "", path); result = null; render(); requestAnimationFrame(() => document.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true })); }

function bindLab(): void {
  const form = document.querySelector<HTMLFormElement>("#experiment-form")!;
  const prediction = document.querySelector<HTMLTextAreaElement>("#prediction")!;
  const runButton = document.querySelector<HTMLButtonElement>("#run")!;
  const code = document.querySelector<HTMLTextAreaElement>("#code")!;
  const updateRun = () => { const ready = prediction.value.trim().length >= 3 && code.value.trim().length > 0 && apiAvailable && !running; runButton.disabled = !ready; runButton.querySelector("span")!.textContent = running ? "Running specimen…" : ready ? "Run the specimen" : !apiAvailable ? "Runner unavailable" : "Record a prediction to run"; document.querySelector("#prediction-count")!.textContent = `${prediction.value.length} characters`; };
  prediction.addEventListener("input", updateRun); code.addEventListener("input", updateRun); updateRun();
  form.addEventListener("submit", async event => { event.preventDefault(); if (runButton.disabled) { prediction.focus(); return; } running = true; updateRun(); document.querySelector("#run-status")!.textContent = "Running the specimen"; try {
      const response = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ language: current.language, code: code.value }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.message || "The runner could not start this experiment.");
      result = payload as RunResult; document.querySelector("#result")!.innerHTML = resultMarkup(result); const note = document.querySelector("#field-note")!; note.classList.remove("pending"); note.classList.add("revealed"); note.querySelector(".trail-content")!.innerHTML = `<div class="section-label"><span>FIELD NOTE · REFLECT</span><span>Ready to preserve</span></div><h2>Explain what changed in your model.</h2>${noteFields()}`; bindSave(code.value, prediction.value); document.querySelector("#run-status")!.textContent = result.ok ? "Run completed; observed output is ready" : "Run completed with an error"; document.querySelector("#result")!.scrollIntoView({ behavior: "smooth", block: "nearest" });
    } catch (error) { document.querySelector("#result")!.innerHTML = `<div class="state-callout error" role="alert"><strong>Observation failed</strong><span>${escapeHtml(error instanceof Error ? error.message : "Try again.")}</span></div>`; document.querySelector("#run-status")!.textContent = "Run failed"; }
    finally { running = false; updateRun(); }
  });
  document.querySelector("#reset-code")?.addEventListener("click", () => { code.value = current.code; result = null; updateRun(); code.focus(); });
  const choose = (id: string) => { const next = exercises.find(ex => ex.id === id); if (next) { current = next; result = null; render(); } };
  document.querySelectorAll<HTMLButtonElement>("[data-exercise]").forEach(button => button.addEventListener("click", () => choose(button.dataset.exercise!)));
  document.querySelector<HTMLSelectElement>("#exercise-select")?.addEventListener("change", event => choose((event.target as HTMLSelectElement).value));
  document.addEventListener("keydown", keyboardRun, { once: true });
}

function keyboardRun(event: KeyboardEvent): void { if ((event.ctrlKey || event.metaKey) && event.key === "Enter" && route() === "/lab") { event.preventDefault(); document.querySelector<HTMLButtonElement>("#run")?.click(); } else if (route() === "/lab") document.addEventListener("keydown", keyboardRun, { once: true }); }

function bindSave(code: string, prediction: string): void {
  document.querySelector("#save-receipt")?.addEventListener("click", () => {
    if (!result) return; const outcome = document.querySelector<HTMLInputElement>('input[name="outcome"]:checked')?.value as Receipt["status"] || "unmarked";
    const receipt: Receipt = { id: crypto.randomUUID(), createdAt: new Date().toISOString(), exerciseId: current.id, title: current.title, language: current.language, runtime: result.runtime, code, prompt: current.question, prediction, stdout: result.stdout, stderr: result.stderr, status: outcome, explanation: current.explanation, learnerNote: document.querySelector<HTMLTextAreaElement>("#learner-note")!.value, durationMs: result.duration_ms, limits: result.limits };
    const receipts = readJson<Receipt[]>(RECEIPTS_KEY, []); receipts.unshift(receipt); localStorage.setItem(RECEIPTS_KEY, JSON.stringify(receipts)); navigate("/archive");
  });
}

function bindArchive(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-download]").forEach(button => button.addEventListener("click", () => { const receipt = readJson<Receipt[]>(RECEIPTS_KEY, []).find(item => item.id === button.dataset.download); if (receipt) downloadReceipt(receipt); }));
  document.querySelectorAll<HTMLButtonElement>("[data-delete]").forEach(button => button.addEventListener("click", () => { const receipts = readJson<Receipt[]>(RECEIPTS_KEY, []); const receipt = receipts.find(item => item.id === button.dataset.delete); if (receipt && confirm(`Delete the field note “${receipt.title}”? This cannot be undone.`)) { localStorage.setItem(RECEIPTS_KEY, JSON.stringify(receipts.filter(item => item.id !== receipt.id))); render(); } }));
}

function downloadReceipt(r: Receipt): void {
  const md = `# Code Prediction Lab — ${r.title}\n\n- Observed: ${r.createdAt}\n- Language: ${r.language}\n- Runtime: ${r.runtime}\n- Duration: ${r.durationMs} ms\n- Outcome: ${r.status}\n- Process: ${r.limits.persistence}\n- Network: ${r.limits.network}\n- Limits: ${r.limits.timeout_ms} ms, ${r.limits.max_code_bytes} byte input, ${r.limits.max_output_bytes} byte output\n\n## Question\n\n${r.prompt}\n\n## Code specimen\n\n\`\`\`${r.language}\n${r.code}\n\`\`\`\n\n## Prediction (written before the run)\n\n${r.prediction}\n\n## Observed stdout\n\n\`\`\`text\n${r.stdout || "(none)"}\n\`\`\`\n\n## Observed stderr\n\n\`\`\`text\n${r.stderr || "(none)"}\n\`\`\`\n\n## Guide explanation\n\n${r.explanation}\n\n## Learner field note\n\n${r.learnerNote || "(not recorded)"}\n`;
  const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" })); const link = document.createElement("a"); link.href = url; link.download = `code-prediction-${r.id.slice(0,8)}.md`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function bindFieldKit(): void {
  document.querySelector<HTMLFormElement>("#license-form")?.addEventListener("submit", async event => { event.preventDefault(); const token = new FormData(event.currentTarget as HTMLFormElement).get("license")?.toString().trim(); if (!token) return; localStorage.setItem(LICENSE_KEY, token); const status = document.querySelector("#license-status")!; status.textContent = "Checking license…"; const valid = await verifyLicense(token, true); status.textContent = valid ? "License verified. Field Kit unlocked." : "That license is not active for this product."; if (valid) setTimeout(render, 600); });
  document.querySelector<HTMLFormElement>("#custom-form")?.addEventListener("submit", event => { event.preventDefault(); const language = (document.querySelector("#custom-language") as HTMLSelectElement).value as Exercise["language"]; const custom: Exercise = { id: crypto.randomUUID(), number: exercises.length + 1, language, runtime: language === "javascript" ? "Node.js 22" : "Python 3.12", title: (document.querySelector("#custom-title") as HTMLInputElement).value.trim(), question: (document.querySelector("#custom-question") as HTMLInputElement).value.trim(), code: (document.querySelector("#custom-code") as HTMLTextAreaElement).value, concept: "custom specimen", explanation: "Compare the observed output with your prediction. Write the language rule you verified.", custom: true }; const customs = readJson<Exercise[]>(CUSTOM_KEY, []); customs.push(custom); localStorage.setItem(CUSTOM_KEY, JSON.stringify(customs)); exercises.push(custom); current = custom; navigate("/lab"); });
}

async function verifyLicense(token: string, force = false): Promise<boolean> {
  const cache = readJson<LicenseCache | null>(LICENSE_CACHE_KEY, null); if (!force && cache && Date.now() - cache.checkedAt < 86_400_000) return cache.valid;
  try { const response = await fetch(`${BILLING_BASE}/api/v1/products/${SLUG}/verify?license=${encodeURIComponent(token)}`); const verdict = await response.json() as { valid: boolean; reason?: string }; const cached = { valid: verdict.valid, checkedAt: Date.now(), reason: verdict.reason }; localStorage.setItem(LICENSE_CACHE_KEY, JSON.stringify(cached)); licenseValid = verdict.valid; licenseNotice = !verdict.valid; return verdict.valid; } catch { return cache?.valid ?? false; }
}

async function initialize(): Promise<void> {
  const returnedLicense = new URLSearchParams(location.search).get("license"); if (returnedLicense) { localStorage.setItem(LICENSE_KEY, returnedLicense); history.replaceState({}, "", location.pathname); }
  const token = localStorage.getItem(LICENSE_KEY); if (token) void verifyLicense(token).then(valid => { if (valid !== licenseValid) { licenseValid = valid; if (route() === "/field-kit") render(); } });
  render();
  try { const response = await fetch("/api/exercises", { signal: AbortSignal.timeout(2500) }); if (!response.ok) throw new Error(); const remote = await response.json() as Exercise[]; exercises = [...remote, ...readJson<Exercise[]>(CUSTOM_KEY, [])]; current = exercises.find(ex => ex.id === current?.id) || exercises[0]; apiAvailable = true; } catch { apiAvailable = false; }
  render(); if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
}

window.addEventListener("popstate", render); window.addEventListener("online", () => { apiAvailable = true; render(); }); window.addEventListener("offline", () => { apiAvailable = false; render(); });
void initialize();
