// functions/api/sites/[id].js — 단일 사이트 조회 / 삭제 / 도메인 설정
import { err, ok, getSession, handleOptions } from '../../_lib/utils.js';

export async function onRequestOptions() { return handleOptions(); }

/* ── GET /api/sites/:id — 사이트 상세 ── */
export async function onRequestGet({ params, request, env }) {
  const userId = await getSession(env, request);
  if (!userId) return err('인증이 필요합니다.', 401);

  const site = await env.DB.prepare(
    'SELECT * FROM sites WHERE id = ? AND user_id = ?'
  ).bind(params.id, userId).first();

  if (!site) return err('사이트를 찾을 수 없습니다.', 404);
  return ok({ site });
}

/* ── DELETE /api/sites/:id — 사이트 삭제 ── */
export async function onRequestDelete({ params, request, env }) {
  const userId = await getSession(env, request);
  if (!userId) return err('인증이 필요합니다.', 401);

  const site = await env.DB.prepare(
    'SELECT * FROM sites WHERE id = ? AND user_id = ?'
  ).bind(params.id, userId).first();

  if (!site) return err('사이트를 찾을 수 없습니다.', 404);

  // InstaWP 사이트 삭제
  if (site.instawp_site_id && env.INSTAWP_API_KEY) {
    try {
      await fetch(`https://app.instawp.io/api/v2/sites/${site.instawp_site_id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.INSTAWP_API_KEY}` },
      });
    } catch (e) {
      console.error('InstaWP delete error:', e);
    }
  }

  // Cloudflare DNS 레코드 삭제 (커스텀 도메인)
  if (site.custom_domain && env.CF_API_TOKEN && env.CF_ZONE_ID) {
    await deleteCloudflareRecord(env, site.custom_domain);
  }

  await env.DB.prepare('DELETE FROM sites WHERE id = ? AND user_id = ?')
    .bind(params.id, userId).run();

  return ok({ message: '사이트가 삭제되었습니다.' });
}

/* ── PUT /api/sites/:id — 커스텀 도메인 설정 ── */
export async function onRequestPut({ params, request, env }) {
  const userId = await getSession(env, request);
  if (!userId) return err('인증이 필요합니다.', 401);

  const site = await env.DB.prepare(
    'SELECT * FROM sites WHERE id = ? AND user_id = ?'
  ).bind(params.id, userId).first();

  if (!site) return err('사이트를 찾을 수 없습니다.', 404);

  let body;
  try { body = await request.json(); }
  catch { return err('잘못된 요청입니다.'); }

  const { custom_domain } = body;

  if (custom_domain) {
    // 도메인 형식 검증
    if (!/^[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+$/.test(custom_domain))
      return err('올바른 도메인 형식이 아닙니다.');

    // 중복 도메인 확인
    const dup = await env.DB.prepare(
      'SELECT id FROM sites WHERE custom_domain = ? AND id != ?'
    ).bind(custom_domain, params.id).first();
    if (dup) return err('이미 다른 사이트에 연결된 도메인입니다.');

    // Cloudflare DNS에 CNAME 추가
    if (env.CF_API_TOKEN && env.CF_ZONE_ID && site.wp_url) {
      await addCloudflareRecord(env, custom_domain, site.subdomain);
    }

    await env.DB.prepare(
      'UPDATE sites SET custom_domain = ? WHERE id = ? AND user_id = ?'
    ).bind(custom_domain, params.id, userId).run();
  }

  const updated = await env.DB.prepare(
    'SELECT * FROM sites WHERE id = ?'
  ).bind(params.id).first();

  return ok({ site: updated });
}

/* ── GET /api/sites/:id/status — 프로비저닝 상태 폴링 ── */
export async function onRequest({ params, request, env }) {
  const url = new URL(request.url);
  if (url.pathname.endsWith('/status')) {
    const userId = await getSession(env, request);
    if (!userId) return err('인증이 필요합니다.', 401);

    const site = await env.DB.prepare(
      `SELECT id, status, wp_url, wp_admin_url, wp_username, wp_password, subdomain, custom_domain
       FROM sites WHERE id = ? AND user_id = ?`
    ).bind(params.id, userId).first();

    if (!site) return err('사이트를 찾을 수 없습니다.', 404);
    return ok({ site });
  }

  // Method routing
  if (request.method === 'GET') return onRequestGet({ params, request, env });
  if (request.method === 'DELETE') return onRequestDelete({ params, request, env });
  if (request.method === 'PUT') return onRequestPut({ params, request, env });
  if (request.method === 'OPTIONS') return handleOptions();

  return err('Method not allowed', 405);
}

/* ── Cloudflare DNS 헬퍼 ── */
async function addCloudflareRecord(env, domain, subdomain) {
  // wp_url의 호스트를 CNAME 대상으로 사용
  const target = `${subdomain}.${env.SITE_DOMAIN || 'cloudpress.site'}`;

  const resp = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/dns_records`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CF_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'CNAME',
        name: domain,
        content: target,
        proxied: true,
        ttl: 1,
      }),
    }
  );

  const data = await resp.json();
  if (!data.success) console.error('CF DNS error:', data.errors);
  return data;
}

async function deleteCloudflareRecord(env, domain) {
  // 레코드 ID 조회 후 삭제
  const listResp = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/dns_records?name=${domain}`,
    {
      headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` },
    }
  );
  const list = await listResp.json();
  if (!list.success || !list.result?.length) return;

  for (const rec of list.result) {
    await fetch(
      `https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/dns_records/${rec.id}`,
      {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${env.CF_API_TOKEN}` },
      }
    );
  }
}
