// Minimal Lark Base client using the app's own identity (tenant_access_token), as n8n will.
import { env, required } from './env.js';

const DOMAIN = `${env.LARK_DOMAIN ?? 'https://open.larksuite.com'}/open-apis`;
let token: { value: string; expires: number } | null = null;

async function tenantToken(): Promise<string> {
  if (token && Date.now() < token.expires - 60_000) return token.value;
  const res = await fetch(`${DOMAIN}/auth/v3/tenant_access_token/internal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: required('LARK_APP_ID'), app_secret: required('LARK_APP_SECRET') }),
  });
  const body = (await res.json()) as { code: number; msg: string; tenant_access_token: string; expire: number };
  if (body.code !== 0) throw new Error(`Lark auth failed: ${body.msg}`);
  token = { value: body.tenant_access_token, expires: Date.now() + body.expire * 1000 };
  return token.value;
}

async function call<T = any>(method: string, pathname: string, body?: unknown): Promise<T> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${DOMAIN}${pathname}`, {
      method,
      headers: { Authorization: `Bearer ${await tenantToken()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60_000),
    }).catch((e) => ({ ok: false, status: 0, json: async () => ({ code: -1, msg: (e as Error).message }) }) as unknown as Response);
    const json = (await res.json().catch(() => ({ code: -1, msg: `HTTP ${res.status}` }))) as any;
    if (json.code === 0) return json.data as T;
    if (attempt === 3 || ![-1, 1254290, 1254291, 99991400].includes(json.code)) throw new Error(`Lark ${method} ${pathname.split('?')[0]}: ${json.code} ${json.msg}`);
    await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  throw new Error('unreachable');
}

/** Lark returns text fields as arrays of segments; flatten to plain strings. */
function plain(v: unknown): unknown {
  if (Array.isArray(v) && v.every((s) => s && typeof s === 'object' && 'text' in s)) return v.map((s: any) => s.text).join('');
  return v;
}

export interface BaseRecord { id: string; fields: Record<string, any> }

const app = () => required('LARK_BASE_APP_TOKEN');

export async function searchRecords(tableId: string, conditions: { field_name: string; operator: string; value: string[] }[] = []): Promise<BaseRecord[]> {
  const out: BaseRecord[] = [];
  let pageToken = '';
  do {
    const data = await call<any>('POST', `/bitable/v1/apps/${app()}/tables/${tableId}/records/search?page_size=100${pageToken ? `&page_token=${pageToken}` : ''}`,
      conditions.length ? { filter: { conjunction: 'and', conditions } } : {});
    for (const item of data.items ?? []) {
      out.push({ id: item.record_id, fields: Object.fromEntries(Object.entries(item.fields).map(([k, v]) => [k, plain(v)])) });
    }
    pageToken = data.has_more ? data.page_token : '';
  } while (pageToken);
  return out;
}

export async function updateRecord(tableId: string, recordId: string, fields: Record<string, unknown>): Promise<void> {
  await call('PUT', `/bitable/v1/apps/${app()}/tables/${tableId}/records/${recordId}`, { fields });
}

export async function createRecord(tableId: string, fields: Record<string, unknown>): Promise<string> {
  const data = await call<any>('POST', `/bitable/v1/apps/${app()}/tables/${tableId}/records`, { fields });
  return data.record.record_id;
}

/** Upload a file into this Base (for an Attachment field). Returns the file_token. */
export async function uploadAttachment(name: string, data: Buffer, mime: string): Promise<string> {
  const form = new FormData();
  form.append('file_name', name);
  form.append('parent_type', mime.startsWith('image/') ? 'bitable_image' : 'bitable_file');
  form.append('parent_node', app());
  form.append('size', String(data.length));
  form.append('file', new Blob([new Uint8Array(data)], { type: mime }), name);
  const res = await fetch(`${DOMAIN}/drive/v1/medias/upload_all`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await tenantToken()}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });
  const body = (await res.json()) as any;
  if (body.code !== 0) throw new Error(`Lark upload ${name}: ${body.code} ${body.msg}`);
  return body.data.file_token;
}

/** Settings table → { setting: parsedValue } (JSON values parsed when possible). */
export async function readSettings(): Promise<Record<string, any>> {
  const rows = await searchRecords(required('LARK_TABLE_SETTINGS_ID'));
  return Object.fromEntries(rows.map((r) => {
    const raw = String(r.fields.value ?? '');
    let value: unknown = raw;
    try { value = JSON.parse(raw); } catch { /* plain text setting */ }
    return [String(r.fields.setting), value];
  }));
}

/** Post a plain-text alert to the alerts group (Settings: alerts_chat). Never throws: alerts must not break a run. */
export async function sendAlert(text: string): Promise<void> {
  try {
    const chat = (await readSettings()).alerts_chat?.chat_id;
    if (!chat) return;
    await call('POST', '/im/v1/messages?receive_id_type=chat_id', { receive_id: chat, msg_type: 'text', content: JSON.stringify({ text: text.slice(0, 1500) }) });
  } catch (e) {
    console.error(`(alert not sent: ${(e as Error).message})`);
  }
}
