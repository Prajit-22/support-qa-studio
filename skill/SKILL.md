---
name: support-qa-review
description: Score a customer-support conversation export (WhatsApp .txt, JSON, or CSV) on seven rule-based metrics with per-line evidence, then help a human reviewer correct and report. Use when someone shares a support chat transcript or export and wants a quality review, agent scorecard, escalation triage, or a QA report. All analysis is local, deterministic, and dependency-free; scores are review aids, never ground truth.
---

# Support QA Review

Review customer support conversations the way a QA lead does: a scorecard
per conversation, the exact lines that drove each score, and a human
correction pass before anything is reported.

## Hard rules

- **Scores are review aids, not ground truth.** They flag which
  conversations deserve a human look. Never present them as measurements
  of agent quality, intent, or factual correctness, and never average
  them into a performance judgment without a human review pass.
- The **confidence signal** measures answer confidence (hedging, fallback
  language), not factual correctness. Say so when you report it.
- **Sentiment** comes from a small transparent lexicon in the script,
  not an emotion model. Sarcasm and Hinglish will fool it.
- Run everything **locally**. Never upload a private chat export to an
  external service to "analyze" it. If the user asks for LLM-based
  analysis of a private export, get explicit permission first and say
  exactly what leaves the device.
- A conversation export contains **other people's messages**. Treat it
  as private data belonging to everyone in the chat.

## Workflow

1. **Get the export.** WhatsApp: chat -> Export chat -> Without media,
   send the `.txt`. Or a JSON/CSV with `sender,text` rows
   (`customer`/`agent`; `user`/`ai` also accepted).
2. **Assign roles** (WhatsApp exports only): ask which participant name
   is the customer and which is the agent, unless it is obvious from the
   messages. Pass the mapping with `--roles`.
3. **Score it:**

   ```bash
   python3 scripts/qa_analyzer.py path/to/export.txt \
       --roles "Riya=customer,Support=agent" --pretty
   ```

   Output is a JSON scorecard: seven metrics (clarity, relevance,
   confidence, completeness, empathy, sentiment, response time), each with
   a 0-1 score, a plain-language reason, and evidence (message index +
   excerpt), plus resolution / escalation flags and a weighted overall.
4. **Read the evidence before repeating a score.** Quote the lines, not
   just the numbers. If a score is obviously wrong for the conversation
   (sarcasm read as positive, a correct answer that hedges politely),
   say so and note the correction instead of defending the machine.
5. **Report** in this shape:

   ```
   <Conversation title> - overall NN/100 (review aid)
   Resolved: yes/no - <reason>   Escalation: yes/no - <reason>
   Strongest: <metric NN - one-line reason>
   Weakest:   <metric NN - one-line reason + quoted evidence line>
   Suggested reviewer focus: <1-2 concrete lines to check first>
   ```

6. **Batch review:** run the script per export, then rank by overall
   ascending - the lowest scores are the queue to review first. Escalations
   override ranking; review them first regardless of score.

## Metric reference (what each score can and cannot say)

| Metric | What it measures | What it cannot |
|---|---|---|
| Clarity | Sentence length in agent replies | Whether replies are well-written |
| Relevance | Word overlap between customer turn and reply | Topical correctness |
| Confidence | Hedging / fallback language | Factual correctness |
| Completeness | Share of questions with substantive replies | Whether answers are right |
| Empathy | Empathy phrase markers, weighted by upset | Warmth of tone in general |
| Sentiment | Lexicon polarity of customer lines | Sarcasm, Hinglish, context |
| Response time | Customer-turn to agent-reply gap | Anything without timestamps |

Overall = 25% clarity + 25% relevance + 20% confidence + 20% completeness + 10% empathy.

## Files

- `scripts/qa_analyzer.py` - the analyzer + importers + CLI. Python 3.9+,
  standard library only.
- `tests/selftest.py` - run `python3 tests/selftest.py` to verify the
  script works on this machine (17 checks, no network).
- `tests/fixtures/` - sample exports used by the selftest; safe to show
  the user as input examples.

## Verify before first use

```bash
python3 tests/selftest.py
```

All checks must pass. If any fail, do not use the script on real data;
report the failure.
