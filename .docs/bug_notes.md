# Bug & Regression Notes (`qa-tester-vera` `/w18` Loop)

## BUG-001: Unescaped `\n` inside `<script>` template literal in `src/ui/dashboard-html.mjs` & missing `/favicon.ico` route
- **Discovered By**: `qa-tester-vera` (`tests/e2e/run-scorecard.mjs` Headless Chromium CDP probe — Baseline Score `49/100`, Hard-Fail Gate triggered on `consoleErrors: 2`, `networkErrors: 1`).
- **Regression Value Card**:
  `Value: protects=Settings Web Dashboard client JS boot & zero-error console; fails_when=unescaped newline in server template literal breaks <script> parsing or /favicon.ico returns 404; why_new=HTTP JSON API tests do not parse HTML <script> in V8 browser engine; seam=GET / + Headless Chromium CDP Runtime.exceptionThrown & Network.responseReceived; no_claim=upstream external LLM availability.`
- **Root Cause**:
  1. `\n` inside `renderDashboardHtml` outer JS template literal emitted raw line breaks inside single-quoted inline `<script>` string literal, throwing `Uncaught SyntaxError: Invalid or unexpected token` in Chromium.
  2. Browser requested `GET /favicon.ico`, which fell through to `404`.
- **Resolution**:
  1. Escaped `\\n` inside inline `<script>` strings in `src/ui/dashboard-html.mjs`.
  2. Added `GET /favicon.ico` handler in `src/core/dashboard-server.mjs` serving `.claude-plugin/icon.png` (`200 image/png`).
- **Status**: Resolved & re-verified via `npm run test:scorecard`.
