// Builds the [Marketing] workflows in n8n Cloud (create or update by name) and exports a git-safe copy to n8n/workflows/.
//   node n8n/build.mjs            → create/update all, leave activation as it is
//   node n8n/build.mjs --activate W5
// Only touches workflows whose name starts with "[Marketing]": the instance also runs client workflows.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { base, env, n8n } from './api.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const cred = JSON.parse(readFileSync(path.join(here, '.credential-ids.json'), 'utf8')).larkApp;
const LARK = 'https://open.larksuite.com/open-apis';
const APP = env.LARK_BASE_APP_TOKEN;
const CONTENT = env.LARK_TABLE_CONTENT_ID;
const SETTINGS = env.LARK_TABLE_SETTINGS_ID;
const BASE_LINK = `https://sglinkbot.sg.larksuite.com/base/${APP}?table=${CONTENT}`;
const HOOK_PATH = `marketing-lark-card-${env.N8N_WEBHOOK_SECRET}`;
if (!env.N8N_WEBHOOK_SECRET) throw new Error('N8N_WEBHOOK_SECRET is empty in .env');

// ---------- node helpers ----------
let y = 0;
const pos = (x) => [x, 300 + (y = 0)];
const bearer = { sendHeaders: true, headerParameters: { parameters: [{ name: 'Authorization', value: "=Bearer {{ $('Lark token').first().json.tenant_access_token }}" }] } };
const larkToken = (x) => ({
  name: 'Lark token', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(x),
  parameters: { method: 'POST', url: `${LARK}/auth/v3/tenant_access_token/internal`, authentication: 'genericCredentialType', genericAuthType: 'httpCustomAuth', sendBody: true, specifyBody: 'json', jsonBody: '{}', options: {} },
  credentials: { httpCustomAuth: { id: cred.id, name: cred.name } },
});
const http = (name, x, parameters, extra = {}) => ({ name, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: pos(x), parameters: { ...bearer, options: {}, ...parameters }, ...extra });
const code = (name, x, jsCode, mode = 'runOnceForAllItems') => ({ name, type: 'n8n-nodes-base.code', typeVersion: 2, position: pos(x), parameters: { mode, jsCode } });
const ifTrue = (name, x, expr) => ({
  name, type: 'n8n-nodes-base.if', typeVersion: 2, position: pos(x),
  parameters: { conditions: { options: { caseSensitive: true, leftValue: '', typeValidation: 'loose' }, combinator: 'and',
    conditions: [{ id: `${name}-c`, leftValue: expr, rightValue: '', operator: { type: 'boolean', operation: 'true', singleValue: true } }] }, options: {} },
});
const chain = (...names) => Object.fromEntries(names.slice(0, -1).map((n, i) => [n, { main: [[{ node: names[i + 1], type: 'main', index: 0 }]] }]));
const readSettings = (x) => http('Read settings', x, { method: 'POST', url: `${LARK}/bitable/v1/apps/${APP}/tables/${SETTINGS}/records/search?page_size=100`, sendBody: true, specifyBody: 'json', jsonBody: '{}' });

// Shared JS: settings rows → object (Lark text fields come back as [{text}] segments).
const SETTINGS_JS = `
const flat = (v) => Array.isArray(v) ? v.map((s) => s.text ?? s).join('') : v;
const settings = {};
for (const r of $('Read settings').first().json.data.items ?? []) {
  const raw = String(flat(r.fields.value) ?? '');
  try { settings[flat(r.fields.setting)] = JSON.parse(raw); } catch { settings[flat(r.fields.setting)] = raw; }
}`;

// ---------- W4 - Send approval card ----------
const w4 = {
  name: '[Marketing] W4 - Send approval card',
  nodes: [
    { name: 'Every 10 minutes', type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, position: pos(0), parameters: { rule: { interval: [{ field: 'minutes', minutesInterval: 10 }] } } },
    larkToken(220),
    readSettings(440),
    http('Find posts awaiting a card', 660, {
      method: 'POST', url: `${LARK}/bitable/v1/apps/${APP}/tables/${CONTENT}/records/search?page_size=20`, sendBody: true, specifyBody: 'json',
      jsonBody: JSON.stringify({ filter: { conjunction: 'and', conditions: [
        { field_name: 'status', operator: 'is', value: ['pending_approval'] },
        { field_name: 'card_message_id', operator: 'isEmpty', value: [] },
      ] } }),
    }),
    code('One item per post', 880, `${SETTINGS_JS}
const approver = settings.approver ?? {};
if (!approver.open_id) throw new Error('Settings row "approver" is missing an open_id');
const items = $input.first().json.data?.items ?? [];
return items.map((r) => {
  const f = r.fields;
  const pics = (f.preview ?? []).filter((a) => String(a.type ?? '').startsWith('image/'));
  return { json: {
    record_id: r.record_id,
    post_id: flat(f.post_id), platform: flat(f.platform), format: flat(f.format), pillar: flat(f.pillar), topic: flat(f.topic),
    caption: flat(f.caption) ?? '', hashtags: flat(f.hashtags) ?? '', qc_notes: flat(f.qc_notes) ?? '',
    scheduled_at: f.scheduled_at ?? null, approval_deadline: f.approval_deadline ?? null,
    media_count: (f.preview ?? []).length, has_video: (f.preview ?? []).some((a) => String(a.type ?? '').startsWith('video/')),
    preview_url: pics[0]?.url ?? '',
    // Cards go to the approval group if one is set (Settings: approval_chat), otherwise privately to the approver.
    receive_type: settings.approval_chat?.chat_id ? 'chat_id' : 'open_id',
    receive_id: settings.approval_chat?.chat_id || approver.open_id,
  } };
});`),
    http('Download preview', 1100, { method: 'GET', url: '={{ $json.preview_url }}', options: { response: { response: { responseFormat: 'file' } } } }, { onError: 'continueRegularOutput', alwaysOutputData: true }),
    http('Upload preview to Lark chat', 1320, {
      method: 'POST', url: `${LARK}/im/v1/images`, sendBody: true, contentType: 'multipart-form-data',
      bodyParameters: { parameters: [{ name: 'image_type', value: 'message' }, { parameterType: 'formBinaryData', name: 'image', inputDataFieldName: 'data' }] },
    }, { onError: 'continueRegularOutput', alwaysOutputData: true }),
    code('Build card', 1540, `
const p = $('One item per post').item.json;
const imageKey = $json.data?.image_key ?? '';
const sgt = (ms) => ms ? new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Singapore', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'not set';
const clip = (s, n) => (s.length > n ? s.slice(0, n) + '…' : s);
const value = (action) => ({ action, record_id: p.record_id, post_id: p.post_id });
const els = [];
if (imageKey) els.push({ tag: 'img', img_key: imageKey, alt: { tag: 'plain_text', content: 'Preview of ' + p.post_id }, scale_type: 'fit_horizontal' });
els.push({ tag: 'markdown', content:
  '**Posts:** ' + sgt(p.scheduled_at) + ' (SGT)\\n**Approve by:** ' + sgt(p.approval_deadline) +
  '\\n**Pillar:** ' + (p.pillar ?? '') + '\\n**Topic:** ' + (p.topic ?? '') +
  (p.media_count > 1 || p.has_video ? '\\n**Media:** ' + p.media_count + ' file(s)' + (p.has_video ? ', including video' : '') + '. Open the Base to see them all.' : '') });
els.push({ tag: 'hr' });
els.push({ tag: 'markdown', content: '**Caption**\\n' + clip(p.caption, 1800) + (p.hashtags ? '\\n\\n' + p.hashtags : '') });
if (p.qc_notes) els.push({ tag: 'markdown', content: '**Automatic checks**\\n' + clip(p.qc_notes, 500) });
els.push({ tag: 'markdown', content: '[Open in Lark Base](${BASE_LINK})' + (p.receive_type === 'chat_id' ? ' · Only the marketing approver can use the buttons.' : '') });
els.push({ tag: 'form', name: 'decision', elements: [
  { tag: 'input', name: 'reason', placeholder: { tag: 'plain_text', content: 'What should change? (needed to reject)' }, max_length: 500 },
  { tag: 'button', name: 'approve', text: { tag: 'plain_text', content: 'Approve' }, type: 'primary_filled', form_action_type: 'submit', behaviors: [{ type: 'callback', value: value('approve') }] },
  { tag: 'button', name: 'reject', text: { tag: 'plain_text', content: 'Reject with feedback' }, type: 'danger', form_action_type: 'submit', behaviors: [{ type: 'callback', value: value('reject') }] },
  { tag: 'button', name: 'regenerate', text: { tag: 'plain_text', content: 'Regenerate' }, type: 'default', form_action_type: 'submit', behaviors: [{ type: 'callback', value: value('regenerate') }] },
] });
const card = {
  schema: '2.0', config: { update_multi: true },
  header: { template: 'blue', title: { tag: 'plain_text', content: 'Approve post ' + p.post_id }, subtitle: { tag: 'plain_text', content: [p.platform, p.format].filter(Boolean).join(' · ') } },
  body: { elements: els },
};
return { json: { record_id: p.record_id, receive_type: p.receive_type, receive_id: p.receive_id, content: JSON.stringify(card) } };`, 'runOnceForEachItem'),
    http('Send card', 1760, { method: 'POST', url: `=${LARK}/im/v1/messages?receive_id_type={{ $json.receive_type }}`, sendBody: true, specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ receive_id: $json.receive_id, msg_type: "interactive", content: $json.content }) }}' }),
    http('Save card id on the post', 1980, { method: 'PUT', url: `=${LARK}/bitable/v1/apps/${APP}/tables/${CONTENT}/records/{{ $('Build card').item.json.record_id }}`, sendBody: true, specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ fields: { card_message_id: $json.data.message_id } }) }}' }),
  ],
};
w4.connections = chain(...w4.nodes.map((n) => n.name));

// ---------- W5 - Handle approval ----------
const DECIDE_JS = `${SETTINGS_JS}
const click = $('Read the click').first().json;
const rec = $('Get the post').first().json.data?.record;
const f = rec?.fields ?? {};
const who = settings.approver ?? {};
const reason = String(click.reason ?? '').trim();
const fail = (msg) => [{ json: { ok: false, message_id: click.message_id, text: msg } }];
if (!who.open_id || click.operator !== who.open_id) return fail('Only the marketing approver (' + (who.email ?? 'see Settings') + ') can approve or reject posts.');
if (!rec) return fail('Post not found in Lark Base.');
if (flat(f.card_message_id) && click.message_id && flat(f.card_message_id) !== click.message_id) return fail('This card is out of date: a newer version was sent.');
if (flat(f.status) !== 'pending_approval') return fail('Already handled (status: ' + flat(f.status) + ').');
if (click.action === 'reject' && !reason) return fail('Please type what should change, then press Reject.');

const now = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Singapore', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const map = {
  approve: { fields: { status: 'approved' }, colour: 'green', title: 'Approved', note: 'Approved on ' + now + '. It will be scheduled for its posting time.' },
  reject: { fields: { status: 'rejected', rejection_reason: reason }, colour: 'red', title: 'Rejected', note: 'Rejected on ' + now + '. A new version will be written with your feedback.' },
  regenerate: { fields: { status: 'rejected', rejection_reason: reason || 'Regenerate requested: write a clearly different version.' }, colour: 'orange', title: 'Regenerating', note: 'Sent back on ' + now + ' for a new version.' },
}[click.action];
if (!map) return fail('Unknown action.');
const card = {
  schema: '2.0', config: { update_multi: true },
  header: { template: map.colour, title: { tag: 'plain_text', content: map.title + ': ' + flat(f.post_id) }, subtitle: { tag: 'plain_text', content: [flat(f.platform), flat(f.format)].filter(Boolean).join(' · ') } },
  body: { elements: [
    { tag: 'markdown', content: map.note + (reason ? '\\n\\n**Your feedback:** ' + reason : '') },
    { tag: 'markdown', content: '[Open in Lark Base](${BASE_LINK})' },
  ] },
};
return [{ json: { ok: true, record_id: rec.record_id, fields: map.fields, message_id: click.message_id, card: JSON.stringify(card) } }];`;

const w5 = {
  name: '[Marketing] W5 - Handle approval',
  nodes: [
    { name: 'Lark card click', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: pos(0), webhookId: 'b7e3c1d2-5a4f-4c8e-9f1a-marketing-w5',
      parameters: { httpMethod: 'POST', path: HOOK_PATH, responseMode: 'responseNode', options: {} } },
    code('Read the click', 220, `
const b = $input.first().json.body ?? {};
if (b.type === 'url_verification' || (b.challenge && !b.event)) return [{ json: { kind: 'challenge', challenge: b.challenge } }];
const e = b.event ?? {};
let v = e.action?.value ?? {};
if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = {}; } }
return [{ json: { kind: 'click', action: v.action, record_id: v.record_id, post_id: v.post_id,
  reason: e.action?.form_value?.reason ?? '', operator: e.operator?.open_id ?? '', message_id: e.context?.open_message_id ?? '' } }];`),
    ifTrue('Is Lark checking the URL?', 440, "={{ $json.kind === 'challenge' }}"),
    { name: 'Answer the URL check', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [660, 150],
      parameters: { respondWith: 'json', responseBody: '={{ JSON.stringify({ challenge: $json.challenge }) }}', options: {} } },
    { name: 'Acknowledge the click', type: 'n8n-nodes-base.respondToWebhook', typeVersion: 1.1, position: [660, 450],
      parameters: { respondWith: 'json', responseBody: '{}', options: {} } },
    { ...larkToken(880), position: [880, 450] },
    { ...readSettings(1100), position: [1100, 450] },
    { ...http('Get the post', 1100, { method: 'GET', url: `=${LARK}/bitable/v1/apps/${APP}/tables/${CONTENT}/records/{{ $('Read the click').first().json.record_id }}` }, { onError: 'continueRegularOutput', alwaysOutputData: true }), position: [1100, 450] },
    { ...code('Check and decide', 1320, DECIDE_JS), position: [1320, 450] },
    { ...ifTrue('Allowed?', 1540, '={{ $json.ok }}'), position: [1540, 450] },
    { ...http('Update the post', 1760, { method: 'PUT', url: `=${LARK}/bitable/v1/apps/${APP}/tables/${CONTENT}/records/{{ $json.record_id }}`, sendBody: true, specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ fields: $json.fields }) }}' }), position: [1760, 350] },
    { ...http('Show the decision on the card', 1980, { method: 'PATCH', url: `=${LARK}/im/v1/messages/{{ $('Check and decide').first().json.message_id }}`, sendBody: true, specifyBody: 'json',
      jsonBody: "={{ JSON.stringify({ content: $('Check and decide').first().json.card }) }}" }), position: [1980, 350] },
    { ...http('Explain in the card thread', 1760, { method: 'POST', url: `=${LARK}/im/v1/messages/{{ $json.message_id }}/reply`, sendBody: true, specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ msg_type: "text", content: JSON.stringify({ text: $json.text }) }) }}' }, { onError: 'continueRegularOutput' }), position: [1760, 550] },
  ],
  // Lark allows 3 seconds for a reply, so the click is acknowledged at once and the card is updated afterwards.
  connections: {
    'Lark card click': { main: [[{ node: 'Read the click', type: 'main', index: 0 }]] },
    'Read the click': { main: [[{ node: 'Is Lark checking the URL?', type: 'main', index: 0 }]] },
    'Is Lark checking the URL?': { main: [[{ node: 'Answer the URL check', type: 'main', index: 0 }], [{ node: 'Acknowledge the click', type: 'main', index: 0 }]] },
    'Acknowledge the click': { main: [[{ node: 'Lark token', type: 'main', index: 0 }]] },
    'Lark token': { main: [[{ node: 'Read settings', type: 'main', index: 0 }]] },
    'Read settings': { main: [[{ node: 'Get the post', type: 'main', index: 0 }]] },
    'Get the post': { main: [[{ node: 'Check and decide', type: 'main', index: 0 }]] },
    'Check and decide': { main: [[{ node: 'Allowed?', type: 'main', index: 0 }]] },
    'Allowed?': { main: [[{ node: 'Update the post', type: 'main', index: 0 }], [{ node: 'Explain in the card thread', type: 'main', index: 0 }]] },
    'Update the post': { main: [[{ node: 'Show the decision on the card', type: 'main', index: 0 }]] },
  },
};
w5.nodes[0].webhookId = undefined; // let n8n assign one

// ---------- create / update / export ----------
const settings = { executionOrder: 'v1', timezone: 'Asia/Singapore', saveManualExecutions: true };
const existing = (await n8n('GET', '/workflows?limit=250')).data;
const activate = process.argv.includes('--activate') ? process.argv.slice(process.argv.indexOf('--activate') + 1) : [];
mkdirSync(path.join(here, 'workflows'), { recursive: true });

for (const wf of [w4, w5]) {
  if (!wf.name.startsWith('[Marketing]')) throw new Error('refusing to touch a non-marketing workflow');
  const body = { name: wf.name, nodes: wf.nodes.map((n, i) => ({ id: `${i + 1}`.padStart(2, '0') + '-' + n.name.replace(/\W+/g, '-').toLowerCase(), ...n })), connections: wf.connections, settings };
  const found = existing.find((w) => w.name === wf.name);
  const saved = found ? await n8n('PUT', `/workflows/${found.id}`, body) : await n8n('POST', '/workflows', body);
  const code = wf.name.match(/W\d+/)[0];
  if (activate.includes(code)) await n8n('POST', `/workflows/${saved.id}/activate`);
  console.log(`${found ? 'updated' : 'created'} ${wf.name} (${saved.id})${activate.includes(code) ? ' · active' : ''}`);
  // Git copy: the secret webhook path is replaced with a placeholder.
  const safe = JSON.stringify({ name: body.name, nodes: body.nodes, connections: body.connections, settings }, null, 2).split(env.N8N_WEBHOOK_SECRET).join('<N8N_WEBHOOK_SECRET>');
  writeFileSync(path.join(here, 'workflows', `${code}-${wf.name.split(' - ')[1].toLowerCase().replace(/\W+/g, '-')}.json`), safe);
}
console.log(`\nLark card callback URL: ${base}/webhook/${HOOK_PATH.replace(env.N8N_WEBHOOK_SECRET, '<secret from .env>')}`);
