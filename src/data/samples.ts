/**
 * Synthetic sample conversations. Every name, company and message is
 * invented for demo purposes - no real customer data.
 */

import type { Conversation } from '../analysis/types';

let n = 0;
const t = (min: number): string => new Date(Date.UTC(2026, 10, 4, 14, min, 0)).toISOString();
const id = (): string => `sample-${(n += 1)}`;

export const SAMPLE_CONVERSATIONS: Conversation[] = [
  {
    id: id(),
    title: 'Refund for a damaged lamp',
    source: 'Synthetic sample',
    messages: [
      { sender: 'customer', author: 'Riya', timestamp: t(0), text: 'Hi, my order #8841 arrived yesterday and the lamp is cracked. How do I get a refund?' },
      { sender: 'agent', author: 'Support - Dev', timestamp: t(2), text: "Hi Riya, I'm sorry the lamp arrived damaged. I can imagine that's frustrating after waiting for the delivery." },
      { sender: 'agent', author: 'Support - Dev', timestamp: t(3), text: 'I have started a refund for order #8841. You will see the amount back on your card within 5 working days, and there is no need to ship the lamp back.' },
      { sender: 'customer', author: 'Riya', timestamp: t(5), text: 'That is a relief, thank you. Will I get a confirmation email?' },
      { sender: 'agent', author: 'Support - Dev', timestamp: t(6), text: 'Yes, a confirmation email with the refund reference is on its way to you now. Anything else I can help with?' },
      { sender: 'customer', author: 'Riya', timestamp: t(7), text: 'No that covers it. Great help, thanks!' },
    ],
  },
  {
    id: id(),
    title: 'Charged twice, no resolution',
    source: 'Synthetic sample',
    messages: [
      { sender: 'customer', author: 'Arjun', timestamp: t(10), text: 'I was charged twice for my subscription this month. This is unacceptable, I want one charge reversed today.' },
      { sender: 'agent', author: 'Support - Meera', timestamp: t(19), text: 'Let me look into that for you.' },
      { sender: 'customer', author: 'Arjun', timestamp: t(26), text: 'It has been seven minutes. This is the second time I am contacting support about the same double charge. Nobody fixed it last time either.' },
      { sender: 'agent', author: 'Support - Meera', timestamp: t(31), text: 'I think the duplicate charge might be from the old billing cycle, maybe. Perhaps it will correct itself on the next statement.' },
      { sender: 'customer', author: 'Arjun', timestamp: t(33), text: 'That is a ridiculous answer. I am furious. A charge does not just correct itself. Reverse it now or I am cancelling and disputing both charges with my bank.' },
      { sender: 'agent', author: 'Support - Meera', timestamp: t(38), text: 'I understand your frustration. I am not sure I can reverse it from my side, it probably needs the billing team.' },
      { sender: 'customer', author: 'Arjun', timestamp: t(41), text: 'So after twenty minutes I get "probably"? Worst support experience I have had. I want this escalated to a manager right now?' },
    ],
  },
  {
    id: id(),
    title: 'Bot deflection loop',
    source: 'Synthetic sample',
    messages: [
      { sender: 'customer', author: 'Kabir', timestamp: t(50), text: 'My invoice shows the wrong GST number. Can you update it and reissue the invoice?' },
      { sender: 'agent', author: 'HelpBot', timestamp: t(50) , text: "I don't understand your request. Could you rephrase it?" },
      { sender: 'customer', author: 'Kabir', timestamp: t(51), text: 'The GST number on invoice INV-2210 is wrong. Please correct it.' },
      { sender: 'agent', author: 'HelpBot', timestamp: t(51), text: "I am not sure about that. I don't know how to help with invoices." },
      { sender: 'customer', author: 'Kabir', timestamp: t(52), text: 'This is a simple billing correction. Why is this so difficult?' },
      { sender: 'agent', author: 'HelpBot', timestamp: t(52), text: "I'm not sure I understand. Please rephrase your question." },
      { sender: 'customer', author: 'Kabir', timestamp: t(53), text: 'Forget the bot. Get me a human agent please.' },
      { sender: 'agent', author: 'HelpBot', timestamp: t(53), text: "I don't understand. Try again later." },
    ],
  },
  {
    id: id(),
    title: 'Slow but eventually resolved',
    source: 'Synthetic sample',
    messages: [
      { sender: 'customer', author: 'Sana', timestamp: t(60), text: 'The app logs me out every few minutes since the last update. What is going on?' },
      { sender: 'agent', author: 'Support - Dev', timestamp: t(84), text: "Hi Sana, sorry to hear the app keeps logging you out. That sounds frustrating, especially if you are in the middle of work." },
      { sender: 'customer', author: 'Sana', timestamp: t(86), text: 'Yes, it is really annoying. Is there a fix?' },
      { sender: 'agent', author: 'Support - Dev', timestamp: t(104), text: 'We found the cause: the 3.2 update shortens session tokens by mistake. Updating to 3.2.1, released today, fixes it. Please update from the Play Store and let me know if the logouts stop.' },
      { sender: 'customer', author: 'Sana', timestamp: t(120), text: 'Updated and it seems stable now. Thanks for the fix.' },
    ],
  },
  {
    id: id(),
    title: 'Plan upgrade question',
    source: 'Synthetic sample',
    messages: [
      { sender: 'customer', author: 'Vikram', timestamp: t(130), text: 'What changes if I move from the Starter plan to the Growth plan?' },
      { sender: 'agent', author: 'Support - Meera', timestamp: t(131), text: 'On Growth you keep everything from Starter, and you add three things: up to 25 team seats instead of 5, priority email support with a 4-hour first response, and custom report exports. The price moves from 999 to 2499 rupees per month, billed monthly, and you can switch back any time.' },
      { sender: 'customer', author: 'Vikram', timestamp: t(133), text: 'Perfect, that answers it. I will upgrade this weekend.' },
    ],
  },
];
