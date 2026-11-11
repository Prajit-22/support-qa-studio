import { describe, expect, it } from 'vitest';
import { applyRoleMap, detectFormat, parseCsv, parseJson, parseWhatsApp } from './parsers';

const WA_IOS = `[12/05/26, 9:41:02 AM] Riya: Hi, my order arrived broken
[12/05/26, 9:42:10 AM] Support: I'm sorry to hear that! Let me fix it
[12/05/26, 9:43:00 AM] Riya: Thanks, great`;

const WA_ANDROID = `04/11/2026, 14:01 - Arjun: Where is my refund?
04/11/2026, 14:03 - Meera Support: It was processed yesterday
04/11/2026, 14:04 - Arjun: Perfect, thank you`;

describe('parseWhatsApp', () => {
  it('parses the iOS export shape with speakers and timestamps', () => {
    const r = parseWhatsApp(WA_IOS);
    expect(r.turns).toHaveLength(3);
    expect([...r.speakers.keys()]).toEqual(['Riya', 'Support']);
    expect(r.turns[0].timestamp).toBeTruthy();
  });

  it('parses the Android export shape', () => {
    const r = parseWhatsApp(WA_ANDROID);
    expect(r.turns).toHaveLength(3);
    expect([...r.speakers.keys()]).toEqual(['Arjun', 'Meera Support']);
  });

  it('joins multi-line messages', () => {
    const r = parseWhatsApp(WA_IOS + '\nsecond line of same message');
    expect(r.turns[2].text).toContain('second line');
  });

  it('maps roles to analyzer messages', () => {
    const r = parseWhatsApp(WA_IOS);
    const msgs = applyRoleMap(r.turns, { Riya: 'customer', Support: 'agent' });
    expect(msgs[0].sender).toBe('customer');
    expect(msgs[1].sender).toBe('agent');
    expect(msgs[1].author).toBe('Support');
  });

  it('warns on non-WhatsApp text', () => {
    const r = parseWhatsApp('hello world, no export here');
    expect(r.turns).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe('parseJson', () => {
  it('accepts a flat message array with user/ai aliases', () => {
    const r = parseJson(JSON.stringify([
      { sender: 'user', message: 'hi, order late' },
      { sender: 'ai', message: 'sorry, it ships today', timestamp: '2026-11-04T14:00:00Z' },
    ]));
    expect(r.conversations).toHaveLength(1);
    expect(r.conversations[0].messages[0].sender).toBe('customer');
    expect(r.conversations[0].messages[1].sender).toBe('agent');
  });

  it('accepts a list of conversations', () => {
    const r = parseJson(JSON.stringify([
      { title: 'A', messages: [{ sender: 'customer', text: 'x?' }, { sender: 'agent', text: 'yes here is the answer' }] },
      { title: 'B', messages: [{ sender: 'customer', text: 'y?' }, { sender: 'agent', text: 'here you go, done' }] },
    ]));
    expect(r.conversations).toHaveLength(2);
    expect(r.conversations[1].title).toBe('B');
  });

  it('warns on invalid JSON', () => {
    expect(parseJson('not json').warnings.length).toBeGreaterThan(0);
  });
});

describe('parseCsv', () => {
  it('parses sender,text rows and skips bad ones', () => {
    const csv = 'sender,text,timestamp\ncustomer,"Where is my order?",2026-11-04T14:00:00Z\nagent,"It ships today, tracking emailed",2026-11-04T14:02:00Z\nstranger,ignore me,';
    const r = parseCsv(csv);
    expect(r.conversations[0].messages).toHaveLength(2);
    expect(r.warnings.join(' ')).toContain('1 row skipped');
    expect(r.conversations[0].messages[0].timestamp).toBe('2026-11-04T14:00:00Z');
  });

  it('requires a sender and text column', () => {
    expect(parseCsv('a,b\n1,2').conversations).toHaveLength(0);
  });
});

describe('detectFormat', () => {
  it('sniffs by extension and content', () => {
    expect(detectFormat('chat.txt', WA_IOS)).toBe('whatsapp');
    expect(detectFormat('data.json', '[]')).toBe('json');
    expect(detectFormat('rows.csv', 'sender,text\na,b')).toBe('csv');
    expect(detectFormat('blob.bin', '???')).toBe('unknown');
  });
});
