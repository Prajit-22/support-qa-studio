#!/usr/bin/env python3
"""Selftest for qa_analyzer.py - 15 checks, no network, no dependencies.

Run: python3 tests/selftest.py   (from the skill directory)
Exit 0 = all checks passed. Any failure prints and exits 1.
"""

import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / 'scripts' / 'qa_analyzer.py'
FIXTURES = HERE / 'fixtures'

checks = []


def check(name, ok, detail=''):
    checks.append((name, bool(ok), detail))


def run(*args):
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), *args],
        capture_output=True, text=True,
    )
    return proc


def run_json(*args):
    proc = run(*args)
    for stream in (proc.stdout, proc.stderr):
        try:
            return proc, json.loads(stream)
        except json.JSONDecodeError:
            continue
    return proc, None


# 1. good conversation scores well
proc, data = run_json(str(FIXTURES / 'good.json'), '--pretty')
check('good.json exits 0', proc.returncode == 0, proc.stderr[:200])
check('good.json parses', data is not None, proc.stdout[:200])
if data:
    m = data['metrics']
    check('good: resolved, no escalation', data['resolution'] is True and data['escalation_needed'] is False)
    check('good: overall > 0.6', data['overall'] > 0.6, f"overall={data['overall']}")
    check('good: empathy marker found', len(m['empathy']['evidence']) > 0)
    check('good: response time ~90s', abs((m['responseTime']['avg_seconds'] or 0) - 90) < 1)
    check('good: sentiment positive', m['sentiment']['label'] == 'positive')
    check('good: every metric in [0,1]',
          all(0 <= m[k]['score'] <= 1 for k in ('clarity', 'relevance', 'accuracy', 'completeness', 'empathy', 'sentiment', 'responseTime')))
    check('good: disclaimer present', 'not ground truth' in data.get('disclaimer', ''))

# 2. whatsapp bot loop needs roles, then escalates
proc, data = run_json(str(FIXTURES / 'bot_loop.txt'))
check('bot_loop: exit 3 without roles', proc.returncode == 3 and data and 'speakers' in data)
proc, data = run_json(str(FIXTURES / 'bot_loop.txt'), '--roles', 'Kabir=customer,HelpBot=agent')
check('bot_loop: exit 0 with roles', proc.returncode == 0, proc.stderr[:200])
if data and 'metrics' in data:
    check('bot_loop: escalation + unresolved',
          data['escalation_needed'] is True and data['resolution'] is False)
    check('bot_loop: fallbacks >= 3', data['fallback_count'] >= 3, f"fallbacks={data['fallback_count']}")
    check('bot_loop: accuracy evidence', len(data['metrics']['accuracy']['evidence']) > 0)

# 3. csv import measures slow replies
proc, data = run_json(str(FIXTURES / 'slow.csv'))
check('slow.csv: exit 0', proc.returncode == 0, proc.stderr[:200])
if data:
    rt = data['metrics']['responseTime']
    check('slow: avg reply measured', rt['avg_seconds'] is not None and rt['avg_seconds'] > 600,
          f"avg={rt['avg_seconds']}")
    check('slow: resolved', data['resolution'] is True)

failed = [c for c in checks if not c[1]]
for name, ok, detail in checks:
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f'  ({detail})' if detail and not ok else ''))
print(f'\n{len(checks) - len(failed)}/{len(checks)} checks passed')
sys.exit(1 if failed else 0)
