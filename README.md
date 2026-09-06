# Personal CFO

A personal finance tracker: accounts (cards, wallets, e-cards), transactions,
budgets, recurring rules, a payoff calculator, and a net-worth/forecast view.
Client-only — everything lives in the browser's `localStorage`, nothing is
sent anywhere. Deployed as a single static file (`index.html`) via GitHub
Pages, and separately published as a Claude Artifact.

## Source layout

The shipped `index.html` isn't hand-edited — it's built by splicing three
source files into a static HTML shell:

- `engine.js` — the `Engine` class: state, persistence (`localStorage`
  read/write, corrupted-data recovery, legacy-schema migration), and all
  derived calculations (balances, budgets, forecasts).
- `ui.js` — the `UI` object: every render function and event handler, working
  directly against `Engine`'s state.
- `app.css` — all styling.

`index.html` itself keeps the static shell (the `<head>`, the service-worker
registration, the init script) plus placeholder `<style>`/`<script>` blocks
that the build fills in.

## Building

```sh
python3 rebuild.py
```

This validates each source file (non-empty, roughly the expected size,
contains a couple of sanity markers) and syntax-checks the JavaScript with
`node --check` *before* touching `index.html`, then writes atomically so a
failed or interrupted build never leaves a half-written file behind. A build
that would come out drastically smaller than the previous `index.html`, or
whose `<style>`/`<script>` block count doesn't match, fails loudly instead of
shipping something broken.

(This checkout doesn't include `personal_cfo_app_final.html` — that's the
separate Claude Artifact copy from the private dev environment. The script
skips any configured target that isn't present and only requires that at
least one was built.)

After a source change, always run the test suite (see `tests/README.md`)
against the freshly built `index.html` before pushing.

## Tests

See [`tests/README.md`](tests/README.md). CI (`.github/workflows/tests.yml`)
runs the full Playwright suite against `index.html` on every push and PR.
