# QA Studio - support review desk

A local-first web app for reviewing customer support conversations.
Import a chat export, get a deterministic scorecard where **every score
links to the exact lines that produced it**, correct scores as a human
reviewer, and export a report.

No accounts, no servers, no uploads. All parsing and analysis runs in
your browser.

## What it does

- **Import** - WhatsApp `.txt` exports (iOS + Android shapes), JSON
  (`sender`/`text`, also accepts the post-conversation-analysis API
  shape), and CSV (`sender,text,timestamp`). WhatsApp imports ask you to
  map participant names to customer/agent roles.
- **Analyze** - seven rule-based metrics per conversation:
  clarity, relevance, accuracy signal, completeness, empathy,
  customer sentiment, and response time (when timestamps exist), plus
  resolution and escalation flags and a weighted overall score.
- **Evidence** - every metric lists the conversation lines that drove
  it, highlighted inline in the transcript. Filter by metric.
- **Review** - override any metric score with a reason, override
  resolution/escalation, sign with your reviewer name. Corrections are
  kept, shown next to the machine score, and persist in localStorage.
- **Report** - rollup of averages, resolution rate, escalations and
  sentiment, with CSV / JSON export and a print-friendly view.

## Honest limits

Scores are **deterministic heuristics - review aids, not ground truth**.
They sort and flag conversations so a human knows where to look first.
The accuracy signal measures answer *confidence* (hedging, fallbacks),
not factual correctness. Sentiment is a small transparent lexicon
(`src/analysis/lexicon.ts`), not an emotion model. A human reviewer can
correct any score, and the correction is preserved next to the original.

## Stack

React 19 + TypeScript + Vite. No runtime dependencies beyond React.
The analyzer (`src/analysis/analyzer.ts`) is a TypeScript port of the
rule-based analyzers in
[post-conversation-analysis](https://github.com/Prajit-22/post-conversation-analysis),
extended to return evidence for every score.

## Develop

```bash
npm install
npm run dev       # local dev server
npm test          # vitest - analyzer + importer suites
npm run build     # type-check + production build to dist/
```

The build is a static site - host `dist/` on any static host
(Vercel, Cloudflare Pages, GitHub Pages, Netlify).

## Sample data

Ships with five synthetic conversations (a clean refund, an escalating
double charge, a bot deflection loop, a slow-but-resolved bug, a quick
plan question). All people, companies and messages are invented.

## Companion agent skill

`skill/` contains a portable SKILL.md plus a dependency-free Python
implementation of the same analyzer (`skill/scripts/qa_analyzer.py`)
with a selftest, so an agent can score transcripts outside the app.
