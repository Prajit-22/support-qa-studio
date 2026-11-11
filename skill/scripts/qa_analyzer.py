#!/usr/bin/env python3
"""Support conversation QA analyzer - deterministic, local, stdlib-only.

Scores a support conversation on seven rule-based metrics with per-line
evidence. Companion implementation of the QA Studio web analyzer
(same rules, same ranges). Scores are review aids, NOT ground truth.

Usage:
    python3 qa_analyzer.py EXPORT [--roles "Name=customer,Name2=agent"] [--pretty]

EXPORT may be a WhatsApp .txt export, JSON ([{sender,text,timestamp?}] or
{"messages": [...]} or a list of conversations), or CSV with sender,text
(,timestamp) columns. Output is a JSON scorecard on stdout.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from datetime import datetime, timezone

# ------------------------------------------------------------------ lexicon

LEXICON = {
    # strong negative
    'terrible': -0.9, 'awful': -0.9, 'horrible': -0.9, 'worst': -0.9, 'hate': -0.9,
    'disgusting': -0.9, 'outrageous': -0.9, 'unacceptable': -0.85, 'furious': -0.85,
    'useless': -0.8, 'pathetic': -0.8, 'ridiculous': -0.75, 'disgrace': -0.85,
    'scam': -0.9, 'fraud': -0.9, 'nightmare': -0.85, 'appalling': -0.85,
    # negative
    'angry': -0.7, 'frustrated': -0.65, 'frustrating': -0.65, 'disappointed': -0.65,
    'disappointing': -0.65, 'upset': -0.6, 'annoyed': -0.6, 'annoying': -0.55,
    'broken': -0.6, 'bad': -0.6, 'poor': -0.55, 'wrong': -0.5, 'fail': -0.6,
    'failed': -0.6, 'failing': -0.6, 'failure': -0.65, 'issue': -0.3, 'problem': -0.35,
    'problems': -0.35, 'slow': -0.4, 'slower': -0.45, 'delay': -0.45, 'delayed': -0.45,
    'late': -0.4, 'stuck': -0.5, 'crash': -0.6, 'crashed': -0.6, 'bug': -0.4,
    'error': -0.4, 'errors': -0.45, 'charged': -0.3, 'overcharged': -0.7,
    'refund': -0.2, 'missing': -0.4, 'lost': -0.5, 'damaged': -0.6, 'defect': -0.55,
    'defective': -0.6, 'unhappy': -0.6, 'dissatisfied': -0.6, 'worse': -0.55,
    'difficult': -0.35, 'confusing': -0.45, 'confused': -0.45, 'unhelpful': -0.6,
    'incompetent': -0.75, 'rude': -0.65, 'ignored': -0.55, 'waiting': -0.25,
    'never': -0.3, 'nobody': -0.35, 'nothing': -0.25, 'unable': -0.35, 'cannot': -0.25,
    'cant': -0.3, 'wont': -0.3, 'not': -0.1, 'no': -0.1, 'complaint': -0.5,
    'sadly': -0.4, 'unfortunately': -0.3, 'worry': -0.4, 'worried': -0.45,
    'concerned': -0.3, 'stress': -0.5, 'stressful': -0.5,
    # strong positive
    'amazing': 0.9, 'excellent': 0.9, 'fantastic': 0.9, 'perfect': 0.85,
    'wonderful': 0.85, 'brilliant': 0.85, 'outstanding': 0.85, 'awesome': 0.85,
    'love': 0.8, 'loved': 0.8, 'superb': 0.85, 'exceptional': 0.85,
    # positive
    'great': 0.7, 'good': 0.55, 'happy': 0.7, 'pleased': 0.65, 'glad': 0.6,
    'thanks': 0.4, 'thank': 0.4, 'grateful': 0.7, 'appreciate': 0.6,
    'appreciated': 0.6, 'helpful': 0.6, 'resolved': 0.6, 'fixed': 0.55,
    'works': 0.4, 'working': 0.35, 'easy': 0.4, 'easily': 0.4, 'quick': 0.35,
    'quickly': 0.4, 'fast': 0.35, 'smooth': 0.45, 'smoothly': 0.45, 'nice': 0.5,
    'best': 0.7, 'better': 0.4, 'satisfied': 0.6, 'recommend': 0.55,
    'friendly': 0.55, 'professional': 0.45, 'efficient': 0.5, 'yay': 0.6, 'thankyou': 0.45,
    'disappointedly': -0.6,
    'correct': 0.35, 'exactly': 0.3, 'yes': 0.15, 'ok': 0.1, 'okay': 0.1,
    'fine': 0.15, 'sure': 0.2, 'welcome': 0.3, 'congratulations': 0.6,
}

NEGATORS = {
    'not', 'no', 'never', 'neither', 'nobody', 'nothing', 'nowhere',
    'hardly', 'barely', 'scarcely', "isn't", "aren't", "wasn't", "weren't",
    "don't", "doesn't", "didn't", "can't", "couldn't", "won't", "wouldn't",
    "shouldn't", "mustn't", "ain't",
}

INTENSIFIERS = {
    'very', 'really', 'extremely', 'so', 'too', 'absolutely', 'totally',
    'completely', 'utterly', 'quite', 'super', 'highly', 'incredibly',
}

_WORD_RE = re.compile(r"[a-z']+")

STOPWORDS = {
    'a', 'an', 'the', 'is', 'it', 'its', 'i', 'me', 'my', 'we', 'you',
    'your', 'and', 'or', 'to', 'of', 'in', 'on', 'for', 'with', 'can',
    'could', 'please', 'hi', 'hello', 'thanks', 'thank', 'do', 'does',
}

FALLBACK_PATTERNS = [
    "i don't understand", 'i do not understand', "didn't understand",
    'could you rephrase', 'can you rephrase', 'please rephrase',
    "i'm not sure", 'i am not sure', "i don't know", 'i do not know',
    'cannot help', "can't help", 'unable to help', 'try again later',
]

EMPATHY_PATTERNS = [
    'i understand', "i'm sorry", 'i am sorry', 'sorry to hear',
    'apologize', 'apologies', 'i can imagine', 'that sounds frustrating',
    "i'm here to help", 'i am here to help',
]

HEDGE_PATTERNS = ['i think', 'maybe', 'perhaps', 'probably', 'not sure', 'might be']

# Whole words only: a substring test treats "show" as "how".
QUESTION_RE = re.compile(r'\b(?:how|what|why|when|where|which|can you|could you)\b')

_APOSTROPHES = str.maketrans({'’': "'", '‘': "'", 'ʼ': "'", '′': "'"})


def polarity(text):
    words = _WORD_RE.findall(text.lower())
    total, hits = 0.0, 0
    negate, intensify = 0, False
    for w in words:
        if w in NEGATORS:
            negate = 3
            continue
        if w in INTENSIFIERS:
            intensify = True
            continue
        if w in LEXICON:
            v = LEXICON[w]
            if intensify:
                v *= 1.4
            if negate > 0:
                v *= -0.6
            total += v
            hits += 1
            intensify = False
        if negate > 0:
            negate -= 1
    if hits == 0:
        return 0.0
    norm = total / max(1.0, len(words) ** 0.5)
    return max(-1.0, min(1.0, norm))


# ------------------------------------------------------------------ helpers

def clamp(v, low=0.0, high=1.0):
    return max(low, min(high, v))


def _excerpt(text, limit=90):
    t = text.strip()
    return t if len(t) <= limit else t[: limit - 1] + '…'


def _content_words(text):
    return {w for w in _WORD_RE.findall(text.lower()) if w not in STOPWORDS and len(w) > 2}


def _split_sentences(text):
    return [p.strip() for p in re.split(r'[.!?]+', text) if p.strip()]


def _agent(messages):
    return [m for m in messages if m['sender'] == 'agent']


def _customer(messages):
    return [m for m in messages if m['sender'] == 'customer']


def _fmt_seconds(s):
    if s < 60:
        return f'{round(s)}s'
    m, sec = divmod(round(s), 60)
    return f'{m}m {sec}s' if sec else f'{m}m'


# ------------------------------------------------------------------ metrics

def m_sentiment(messages):
    users = _customer(messages)
    if not users:
        return {'id': 'sentiment', 'label': 'neutral', 'polarity': 0.0, 'score': 0.5,
                'summary': 'No customer messages to score.', 'evidence': []}, 0.0
    scored = [(m, polarity(m['text'])) for m in users]
    avg = sum(p for _, p in scored) / len(scored)
    label = 'positive' if avg > 0.1 else 'negative' if avg < -0.1 else 'neutral'
    ranked = sorted(scored, key=lambda x: x[1], reverse=(label != 'negative'))
    evidence = [
        {'message_index': messages.index(m), 'excerpt': _excerpt(m['text']),
         'note': f'customer line, polarity {p:.2f} (lexicon)'}
        for m, p in ranked
        if (p < -0.05 if label == 'negative' else p > 0.05)
    ][:4]
    summary = (f'Average customer sentiment is {label} ({avg:.2f} on a -1..1 lexicon '
               f'scale), from {len(users)} customer message{"s" if len(users) != 1 else ""}.')
    return {'id': 'sentiment', 'label': label, 'polarity': round(avg, 3),
            'score': round(clamp((avg + 1) / 2), 3), 'summary': summary,
            'evidence': evidence}, round(avg, 3)


def m_clarity(messages):
    agents = _agent(messages)
    if not agents:
        return {'id': 'clarity', 'score': 0.5, 'summary': 'No agent messages to score.', 'evidence': []}
    scores, evidence = [], []
    for msg in agents:
        sentences = _split_sentences(msg['text']) or [msg['text']]
        lengths = [len(s.split()) for s in sentences]
        avg = sum(lengths) / len(lengths)
        score = 1.0
        if avg > 25:
            score -= min(0.5, (avg - 25) * 0.03)
        elif avg < 3:
            score -= 0.2
        long_sentences = sum(1 for l in lengths if l > 40)
        score -= 0.1 * long_sentences
        if avg > 25 or long_sentences or avg < 3:
            evidence.append({'message_index': messages.index(msg), 'excerpt': _excerpt(msg['text']),
                             'note': f'{long_sentences} sentence(s) over 40 words (avg {avg:.0f})'
                             if long_sentences else f'avg sentence length {avg:.0f} words'})
        scores.append(clamp(score))
    score = round(sum(scores) / len(scores), 3)
    summary = ('Agent replies use readable sentence lengths throughout.' if not evidence
               else f'{len(evidence)} agent message(s) with very long or fragmentary sentences.')
    return {'id': 'clarity', 'score': score, 'summary': summary, 'evidence': evidence[:5]}


def m_relevance(messages):
    pairs, total, pair_scores = 0, 0.0, []
    for i, msg in enumerate(messages):
        if msg['sender'] != 'customer':
            continue
        nxt = messages[i + 1] if i + 1 < len(messages) else None
        if not nxt or nxt['sender'] != 'agent':
            continue
        uw, aw = _content_words(msg['text']), _content_words(nxt['text'])
        if not uw or not aw:
            continue
        overlap = len(uw & aw) / len(uw)
        total += min(1.0, 0.4 + overlap)  # a direct echo is not required
        pairs += 1
        pair_scores.append((i + 1, overlap))
    if pairs == 0:
        return {'id': 'relevance', 'score': 0.5, 'summary': 'No customer/agent turn pairs to compare.', 'evidence': []}
    score = round(clamp(total / pairs), 3)
    weakest = sorted(pair_scores, key=lambda x: x[1])[:3]
    evidence = [
        {'message_index': j, 'excerpt': _excerpt(messages[j]['text']),
         'note': f'shares {overlap * 100:.0f}% of the customer\'s content words'}
        for j, overlap in weakest
    ]
    return {'id': 'relevance', 'score': score,
            'summary': f'Agent replies tracked customer wording across {pairs} turn(s). Weakest exchanges listed.',
            'evidence': evidence}


def m_accuracy(messages, fallback_count):
    agents = _agent(messages)
    if not agents:
        return {'id': 'accuracy', 'score': 0.5, 'summary': 'No agent messages to score.', 'evidence': []}
    hedges, evidence = 0, []
    for msg in agents:
        lower = msg['text'].lower()
        hits = [p for p in HEDGE_PATTERNS if p in lower]
        fbs = [p for p in FALLBACK_PATTERNS if p in lower]
        hedges += len(hits)
        if hits or fbs:
            evidence.append({'message_index': messages.index(msg), 'excerpt': _excerpt(msg['text']),
                             'note': '; '.join([f'hedge "{h}"' for h in hits] + [f'fallback "{f}"' for f in fbs])})
    score = round(clamp(1.0 - 0.1 * hedges - 0.15 * fallback_count), 3)
    note = 'This measures confidence, not factual correctness.'
    summary = (f'No hedging or fallback language detected. {note}' if not (hedges or fallback_count)
               else f'{hedges} hedge(s) and {fallback_count} fallback(s) detected. {note}')
    return {'id': 'accuracy', 'score': score, 'summary': summary, 'evidence': evidence[:6]}


def m_completeness(messages, fallback_count):
    asked, answered, unanswered = 0, 0, []
    for i, msg in enumerate(messages):
        if msg['sender'] != 'customer':
            continue
        text = msg['text'].lower()
        if '?' not in text and not QUESTION_RE.search(text):
            continue
        asked += 1
        nxt = messages[i + 1] if i + 1 < len(messages) else None
        if nxt and nxt['sender'] == 'agent':
            reply = nxt['text'].lower()
            if len(reply.split()) >= 5 and not any(p in reply for p in FALLBACK_PATTERNS):
                answered += 1
            else:
                unanswered.append(i)
        else:
            unanswered.append(i)
    evidence = [{'message_index': i, 'excerpt': _excerpt(messages[i]['text']),
                 'note': 'customer question without a substantive agent reply'} for i in unanswered[:5]]
    if asked == 0:
        score = 0.8 if fallback_count == 0 else 0.5
        return {'id': 'completeness', 'score': score,
                'summary': f'No explicit customer questions detected; baseline {score} applied.',
                'evidence': evidence}
    return {'id': 'completeness', 'score': round(clamp(answered / asked), 3),
            'summary': f'{answered} of {asked} customer question(s) got a substantive reply (5+ words, no fallback).',
            'evidence': evidence}


def m_empathy(messages, user_sentiment):
    hits, evidence = 0, []
    for msg in _agent(messages):
        lower = msg['text'].lower()
        found = [p for p in EMPATHY_PATTERNS if p in lower]
        if found:
            hits += len(found)
            evidence.append({'message_index': messages.index(msg), 'excerpt': _excerpt(msg['text']),
                             'note': f'empathy marker "{found[0]}"'})
    upset = user_sentiment < -0.1
    score = round(clamp((0.3 if upset else 0.6) + (0.35 if upset else 0.2) * hits), 3)
    if hits == 0:
        summary = ('Customer is upset but no empathy markers appear in agent replies.' if upset
                   else 'No explicit empathy markers in agent replies.')
    else:
        summary = f'{hits} empathy marker(s) in agent replies' + (' (customer is upset, so these weigh more).' if upset else '.')
    return {'id': 'empathy', 'score': score, 'summary': summary, 'evidence': evidence[:5]}


def m_response_time(messages):
    deltas = []
    for i, msg in enumerate(messages):
        if msg['sender'] != 'customer' or not msg.get('timestamp'):
            continue
        nxt = messages[i + 1] if i + 1 < len(messages) else None
        if not nxt or nxt['sender'] != 'agent' or not nxt.get('timestamp'):
            continue
        t0, t1 = _parse_ts(msg['timestamp']), _parse_ts(nxt['timestamp'])
        if t0 and t1 and t1 >= t0:
            deltas.append((i, (t1 - t0).total_seconds()))
    if not deltas:
        return {'id': 'responseTime', 'avg_seconds': None, 'score': 0.5,
                'summary': 'No usable timestamps, so response time could not be measured.', 'evidence': []}
    avg = sum(d for _, d in deltas) / len(deltas)
    score = round(clamp(1 - max(0.0, avg - 60) / (30 * 60 - 60)), 3)
    evidence = [{'message_index': i + 1, 'excerpt': _excerpt(messages[i + 1]['text']),
                 'note': f'agent replied after {_fmt_seconds(d)}'}
                for i, d in sorted(deltas, key=lambda x: -x[1])[:3]]
    return {'id': 'responseTime', 'avg_seconds': round(avg, 2), 'score': score,
            'summary': f'Average first-reply time {_fmt_seconds(avg)} across {len(deltas)} customer turn(s) '
                       '(under 60s scores full, 30min+ scores zero).',
            'evidence': evidence}


def _parse_ts(ts):
    try:
        dt = datetime.fromisoformat(str(ts).replace('Z', '+00:00'))
    except (ValueError, TypeError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def m_resolution(messages, fallback_count):
    agents = _agent(messages)
    if not agents:
        return False, 'No agent messages in the conversation.'
    if fallback_count >= 2:
        return False, f'{fallback_count} fallback replies - the conversation never got past deflection.'
    last = agents[-1]['text'].lower()
    if any(p in last for p in FALLBACK_PATTERNS):
        return False, 'The final agent reply is a fallback.'
    if messages and messages[-1]['sender'] == 'customer' and messages[-1]['text'].strip().endswith('?'):
        return False, 'The conversation ends on an unanswered customer question.'
    if not _customer(messages):
        return False, 'No customer messages in the conversation.'
    return True, 'Ends with a substantive agent reply and no open customer question.'


# ------------------------------------------------------------------- entry

def analyze(raw_messages):
    messages = [
        {**m, 'text': m['text'].translate(_APOSTROPHES)}
        for m in raw_messages if m.get('text', '').strip()
    ]
    agents = _agent(messages)
    fallback_count = sum(
        1 for msg in agents
        if any(p in msg['text'].lower() for p in FALLBACK_PATTERNS)
    )
    sentiment, raw_sent = m_sentiment(messages)
    resolution, resolution_reason = m_resolution(messages, fallback_count)
    escalation = (raw_sent < -0.2 and not resolution) or fallback_count >= 3
    escalation_reason = (
        f'{fallback_count} fallback replies - automated deflection loop.' if fallback_count >= 3
        else f'Negative customer sentiment ({raw_sent:.2f}) with no resolution.'
        if escalation else 'No escalation signals.'
    )
    clarity = m_clarity(messages)
    relevance = m_relevance(messages)
    accuracy = m_accuracy(messages, fallback_count)
    completeness = m_completeness(messages, fallback_count)
    empathy = m_empathy(messages, raw_sent)
    response_time = m_response_time(messages)
    overall = round(clamp(
        0.25 * clarity['score'] + 0.25 * relevance['score'] +
        0.20 * accuracy['score'] + 0.20 * completeness['score'] +
        0.10 * empathy['score']
    ), 3)
    return {
        'disclaimer': 'Deterministic heuristic scores. Review aids, not ground truth.',
        'overall': overall,
        'resolution': resolution, 'resolution_reason': resolution_reason,
        'escalation_needed': bool(escalation), 'escalation_reason': escalation_reason,
        'fallback_count': fallback_count,
        'metrics': {
            'clarity': clarity, 'relevance': relevance, 'accuracy': accuracy,
            'completeness': completeness, 'empathy': empathy,
            'sentiment': sentiment, 'responseTime': response_time,
        },
    }


# ------------------------------------------------------------------ parsers

WA_PATTERNS = [
    re.compile(r'^\[(\d{1,2}[/.]\d{1,2}[/.]\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\]\s+([^:]+?):\s(.*)$'),
    re.compile(r'^(\d{1,2}[/.]\d{1,2}[/.]\d{2,4}),\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?)\s+-\s+([^:]+?):\s(.*)$'),
]


def _wa_ts(date, time_str):
    parts = date.replace('.', '/').split('/')
    if len(parts) != 3:
        return None
    day, month, year = (int(p) for p in parts)
    if year < 100:
        year += 2000
    m = re.match(r'(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?', time_str)
    if not m:
        return None
    h, minute = int(m.group(1)), int(m.group(2))
    sec = int(m.group(3)) if m.group(3) else 0
    ampm = m.group(4).upper() if m.group(4) else None
    if ampm == 'PM' and h < 12:
        h += 12
    if ampm == 'AM' and h == 12:
        h = 0
    try:
        return datetime(year, month, day, h, minute, sec, tzinfo=timezone.utc).isoformat()
    except ValueError:
        return None


def parse_whatsapp(text, roles):
    turns = []
    for line in text.splitlines():
        if not line.strip():
            continue
        matched = False
        for pat in WA_PATTERNS:
            m = pat.match(line)
            if not m:
                continue
            matched = True
            author, body = m.group(3).strip(), m.group(4).strip()
            turns.append({'author': author, 'text': body, 'timestamp': _wa_ts(m.group(1), m.group(2))})
            break
        if not matched and turns:
            turns[-1]['text'] += '\n' + line.strip()
    messages = []
    for t in turns:
        role = roles.get(t['author'])
        if not role:
            continue
        msg = {'sender': role, 'text': t['text']}
        if t.get('timestamp'):
            msg['timestamp'] = t['timestamp']
        messages.append(msg)
    return messages, sorted({t['author'] for t in turns})


def _to_sender(raw):
    s = str(raw).strip().lower()
    if s in ('customer', 'user', 'client'):
        return 'customer'
    if s in ('agent', 'ai', 'support', 'bot'):
        return 'agent'
    return None


def parse_json_export(data):
    def as_messages(arr):
        out = []
        for item in arr:
            if not isinstance(item, dict):
                continue
            sender = _to_sender(item.get('sender', item.get('role', '')))
            body = str(item.get('text', item.get('message', ''))).strip()
            if sender and body:
                msg = {'sender': sender, 'text': body}
                if item.get('timestamp'):
                    msg['timestamp'] = str(item['timestamp'])
                out.append(msg)
        return out

    if isinstance(data, list):
        if data and isinstance(data[0], dict) and 'messages' in data[0]:
            return as_messages(data[0]['messages'])
        return as_messages(data)
    if isinstance(data, dict) and 'messages' in data:
        return as_messages(data['messages'])
    return []


def parse_csv_export(text):
    rows = list(csv.reader(text.splitlines()))
    if len(rows) < 2:
        return []
    header = [h.strip().lower() for h in rows[0]]
    try:
        si = next(i for i, h in enumerate(header) if h in ('sender', 'role', 'from'))
        ti = next(i for i, h in enumerate(header) if h in ('text', 'message', 'body'))
    except StopIteration:
        return []
    tsi = next((i for i, h in enumerate(header) if h in ('timestamp', 'time', 'date', 'at')), None)
    out = []
    for row in rows[1:]:
        if len(row) <= max(si, ti):
            continue
        sender = _to_sender(row[si])
        body = row[ti].strip()
        if sender and body:
            msg = {'sender': sender, 'text': body}
            if tsi is not None and len(row) > tsi and row[tsi].strip():
                msg['timestamp'] = row[tsi].strip()
            out.append(msg)
    return out


# ---------------------------------------------------------------------- cli

def main(argv=None):
    ap = argparse.ArgumentParser(description='Deterministic support-conversation QA scorecard.')
    ap.add_argument('export', help='WhatsApp .txt, JSON, or CSV export')
    ap.add_argument('--roles', default='',
                    help='WhatsApp speaker mapping, e.g. "Riya=customer,Support=agent"')
    ap.add_argument('--pretty', action='store_true', help='Indent JSON output')
    args = ap.parse_args(argv)

    try:
        with open(args.export, 'r', encoding='utf-8-sig') as fh:
            text = fh.read()
    except OSError as exc:
        print(json.dumps({'error': f'cannot read {args.export}: {exc}'}), file=sys.stderr)
        return 2

    roles = {}
    for pair in args.roles.split(','):
        if '=' in pair:
            name, role = pair.split('=', 1)
            role = _to_sender(role)
            if role:
                roles[name.strip()] = role

    stripped = text.lstrip()
    lower = args.export.lower()
    if lower.endswith('.csv'):
        messages = parse_csv_export(text)
        speakers = []
    elif lower.endswith('.json') or (
        not lower.endswith('.txt') and stripped.startswith(('{', '['))
    ):
        # .txt stays WhatsApp even though its lines start with '['.
        try:
            messages = parse_json_export(json.loads(text))
        except json.JSONDecodeError:
            print(json.dumps({'error': 'invalid JSON'}), file=sys.stderr)
            return 2
        speakers = []
    else:
        messages, speakers = parse_whatsapp(text, roles)
        if speakers and not roles:
            print(json.dumps({
                'error': 'whatsapp export needs role mapping',
                'speakers': speakers,
                'hint': 're-run with --roles "Name=customer,Name2=agent"',
            }), file=sys.stderr)
            return 3

    if not messages:
        print(json.dumps({'error': 'no usable messages found (need customer/agent senders with text)'}), file=sys.stderr)
        return 2

    result = analyze(messages)
    result['message_count'] = len(messages)
    print(json.dumps(result, indent=2 if args.pretty else None, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
