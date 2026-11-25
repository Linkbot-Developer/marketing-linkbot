// Publishes docs/guides/*.md as Lark Docs (with images) and lists them in the Base's "Guides" table.
// Run from runner/:  npx tsx ../docs/guides/publish.ts
// Re-running updates the same docs (ids kept in docs/guides/.lark-docs.json). Owner: the approver (Settings).
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env, required } from '../../runner/src/env.js';
import { readSettings } from '../../runner/src/lark.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const D = `${env.LARK_DOMAIN ?? 'https://open.larksuite.com'}/open-apis`;
const WEB = 'https://sglinkbot.sg.larksuite.com';
const APP = required('LARK_BASE_APP_TOKEN');
const IDS = path.join(here, '.lark-docs.json');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let tok = '';
async function token() {
  tok ||= (await (await fetch(`${D}/auth/v3/tenant_access_token/internal`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: required('LARK_APP_ID'), app_secret: required('LARK_APP_SECRET') }) })).json()).tenant_access_token;
  return tok;
}
async function api(method: string, p: string, body?: unknown): Promise<any> {
  for (let i = 0; i < 4; i++) {
    const res = await fetch(`${D}${p}`, { method, headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const j = (await res.json().catch(() => ({ code: -1, msg: `HTTP ${res.status}` }))) as any;
    if (j.code === 0) return j.data;
    if ([99991400, 1770000, -1].includes(j.code) || res.status === 429) { await sleep(1500 * (i + 1)); continue; }
    throw new Error(`${method} ${p.split('?')[0]} → ${j.code} ${j.msg}`);
  }
  throw new Error(`${method} ${p} kept failing`);
}

// ---- Markdown (small subset) → Lark docx blocks ----
type El = { text_run: { content: string; text_element_style?: Record<string, unknown> } };
function inline(s: string): El[] {
  const out: El[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  for (const m of s.matchAll(re)) {
    if (m.index! > last) out.push({ text_run: { content: s.slice(last, m.index) } });
    if (m[2]) out.push({ text_run: { content: m[2], text_element_style: { bold: true } } });
    else if (m[3]) out.push({ text_run: { content: m[3], text_element_style: { inline_code: true } } });
    else if (m[4]) out.push({ text_run: { content: m[4], text_element_style: { italic: true } } });
    else if (m[5]) out.push({ text_run: { content: m[5], text_element_style: { link: { url: encodeURIComponent(m[6]) } } } });
    last = m.index! + m[0].length;
  }
  if (last < s.length) out.push({ text_run: { content: s.slice(last) } });
  return out.length ? out : [{ text_run: { content: '' } }];
}
interface Item { block: any; children?: any[]; image?: string }
function parse(md: string): { title: string; items: Item[] } {
  const lines = md.split(/\r?\n/);
  let title = '';
  const items: Item[] = [];
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    let m;
    if ((m = line.match(/^# (.+)/))) { title = m[1]; continue; }
    if ((m = line.match(/^(#{2,3}) (.+)/))) { const k = m[1].length === 2 ? 'heading2' : 'heading3'; items.push({ block: { block_type: m[1].length === 2 ? 4 : 5, [k]: { elements: inline(m[2]) } } }); continue; }
    if ((m = line.match(/^!\[[^\]]*\]\(([^)]+)\)/))) { items.push({ block: { block_type: 27, image: {} }, image: path.join(here, m[1]) }); continue; }
    if (line === '---') { items.push({ block: { block_type: 22, divider: {} } }); continue; }
    if ((m = line.match(/^\s{2,}- (.+)/)) && items.length) { (items[items.length - 1].children ??= []).push({ block_type: 12, bullet: { elements: inline(m[1]) } }); continue; }
    if ((m = line.match(/^- (.+)/))) { items.push({ block: { block_type: 12, bullet: { elements: inline(m[1]) } } }); continue; }
    if ((m = line.match(/^\d+\. (.+)/))) { items.push({ block: { block_type: 13, ordered: { elements: inline(m[1]) } } }); continue; }
    items.push({ block: { block_type: 2, text: { elements: inline(line.trim()) } } });
  }
  return { title, items };
}

async function uploadImage(docId: string, blockId: string, file: string) {
  const data = readFileSync(file);
  const form = new FormData();
  form.append('file_name', path.basename(file));
  form.append('parent_type', 'docx_image');
  form.append('parent_node', blockId);
  form.append('size', String(statSync(file).size));
  form.append('extra', JSON.stringify({ drive_route_token: docId }));
  form.append('file', new Blob([data], { type: 'image/png' }), path.basename(file));
  const j = (await (await fetch(`${D}/drive/v1/medias/upload_all`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}` }, body: form })).json()) as any;
  if (j.code !== 0) throw new Error(`image upload: ${j.code} ${j.msg}`);
  // PNGs are 2x; show them at their design width.
  const w = data.readUInt32BE(16), h = data.readUInt32BE(20);
  await api('PATCH', `/docx/v1/documents/${docId}/blocks/${blockId}`, { replace_image: { token: j.data.file_token, width: Math.round(w / 2), height: Math.round(h / 2) } });
}

async function writeDoc(docId: string, items: Item[]) {
  // Clear existing content (for updates).
  const kids = (await api('GET', `/docx/v1/documents/${docId}/blocks/${docId}`)).block?.children ?? [];
  if (kids.length) await api('DELETE', `/docx/v1/documents/${docId}/blocks/${docId}/children/batch_delete`, { start_index: 0, end_index: kids.length });
  let index = 0;
  let batch: Item[] = [];
  const flush = async () => {
    if (!batch.length) return;
    const res = await api('POST', `/docx/v1/documents/${docId}/blocks/${docId}/children?document_revision_id=-1`, { index, children: batch.map((b) => b.block) });
    const created = res.children as any[];
    for (let i = 0; i < batch.length; i++) {
      const it = batch[i];
      if (it.image) await uploadImage(docId, created[i].block_id, it.image);
      if (it.children?.length) await api('POST', `/docx/v1/documents/${docId}/blocks/${created[i].block_id}/children?document_revision_id=-1`, { index: 0, children: it.children });
    }
    index += batch.length;
    batch = [];
  };
  for (const it of items) {
    batch.push(it);
    if (it.image || it.children || batch.length >= 40) await flush();
  }
  await flush();
}

const guides = [
  { key: 'management', file: 'management.md', audience: 'Management', covers: 'What the system does, the flow, safety, status, what we need and costs (plain language)' },
  { key: 'developer', file: 'developer.md', audience: 'Developer', covers: 'Architecture, statuses, pipeline, n8n workflows, deployment, security, operations' },
];
const ids: Record<string, string> = existsSync(IDS) ? JSON.parse(readFileSync(IDS, 'utf8')) : {};
const approver = (await readSettings()).approver?.open_id as string;

for (const g of guides) {
  const { title, items } = parse(readFileSync(path.join(here, g.file), 'utf8'));
  let docId = ids[g.key];
  const fresh = !docId;
  if (fresh) {
    docId = (await api('POST', '/docx/v1/documents', { title })).document.document_id;
    ids[g.key] = docId;
    writeFileSync(IDS, JSON.stringify(ids, null, 2));
  }
  await writeDoc(docId, items);
  if (fresh) {
    // Company-internal read access by link; the approver becomes the owner (the app keeps edit access for updates).
    await api('PATCH', `/drive/v1/permissions/${docId}/public?type=docx`, { external_access: false, link_share_entity: 'tenant_readable' });
    if (approver) await api('POST', `/drive/v1/permissions/${docId}/members/transfer_owner?type=docx&need_notification=false&remove_old_owner=false&old_owner_perm=full_access`, { member_type: 'openid', member_id: approver });
  }
  console.log(`${fresh ? 'created' : 'updated'} ${title}: ${WEB}/docx/${docId}`);
}

// ---- Guides table in the Base ----
const tables = (await api('GET', `/bitable/v1/apps/${APP}/tables?page_size=100`)).items as any[];
let table = tables.find((t) => t.name === 'Guides')?.table_id as string | undefined;
if (!table) {
  table = (await api('POST', `/bitable/v1/apps/${APP}/tables`, { table: { name: 'Guides', default_view_name: 'All guides', fields: [
    { field_name: 'Guide', type: 1 },
    { field_name: 'Audience', type: 3, property: { options: [{ name: 'Management' }, { name: 'Developer' }] } },
    { field_name: 'Link', type: 15 },
    { field_name: 'What it covers', type: 1 },
    { field_name: 'Updated', type: 5, property: { date_formatter: 'yyyy/MM/dd' } },
  ] } })).table_id;
  console.log('created Guides table');
}
const rows = (await api('POST', `/bitable/v1/apps/${APP}/tables/${table}/records/search?page_size=100`, {})).items ?? [];
for (const g of guides) {
  const title = parse(readFileSync(path.join(here, g.file), 'utf8')).title;
  const fields = { Guide: title, Audience: g.audience, Link: { text: 'Open the guide', link: `${WEB}/docx/${ids[g.key]}` }, 'What it covers': g.covers, Updated: Date.now() };
  const row = rows.find((r: any) => JSON.stringify(r.fields.Audience ?? '').includes(g.audience));
  if (row) await api('PUT', `/bitable/v1/apps/${APP}/tables/${table}/records/${row.record_id}`, { fields });
  else await api('POST', `/bitable/v1/apps/${APP}/tables/${table}/records`, { fields });
}
console.log(`Guides table: ${WEB}/base/${APP}?table=${table}`);
