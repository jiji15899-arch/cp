// functions/api/sites/index.js — 사이트 목록 조회 & 신규 생성
import { err, ok, json, getSession, getUserById, genId, handleOptions } from '../../_lib/utils.js';

export async function onRequestOptions() { return handleOptions(); }

/* ── GET /api/sites — 내 사이트 목록 ── */
export async function onRequestGet({ request, env }) {
  const userId = await getSession(env, request);
  if (!userId) return err('인증이 필요합니다.', 401);

  const { results } = await env.DB.prepare(
    `SELECT id, name, subdomain, custom_domain, wp_url, wp_admin_url,
            wp_username, wp_password, status, php_version, region, plan, created_at
     FROM sites WHERE user_id = ? ORDER BY created_at DESC`
  ).bind(userId).all();

  return ok({ sites: results });
}

/* ── POST /api/sites — WordPress 사이트 개설 ── */
export async function onRequestPost({ request, env }) {
  const userId = await getSession(env, request);
  if (!userId) return err('인증이 필요합니다.', 401);

  const user = await getUserById(env, userId);
  if (!user) return err('사용자를 찾을 수 없습니다.', 404);

  // 플랜별 사이트 수 제한
  const planLimits = { free: 1, starter: 1, pro: 5, enterprise: -1 };
  const limit = planLimits[user.plan] ?? 1;
  if (limit !== -1) {
    const { results: existing } = await env.DB.prepare(
      'SELECT id FROM sites WHERE user_id = ?'
    ).bind(userId).all();
    if (existing.length >= limit)
      return err(`현재 플랜(${user.plan})에서는 최대 ${limit}개 사이트만 개설할 수 있습니다.`);
  }

  let body;
  try { body = await request.json(); }
  catch { return err('잘못된 요청입니다.'); }

  const { name, subdomain, php_version = '8.2', region = 'auto', plan = 'free' } = body;

  if (!name || !subdomain) return err('사이트 이름과 서브도메인을 입력해주세요.');
  if (!/^[a-z0-9-]{3,30}$/.test(subdomain))
    return err('서브도메인은 3~30자의 영소문자, 숫자, 하이픈만 사용할 수 있습니다.');

  // 서브도메인 중복 확인
  const dup = await env.DB.prepare('SELECT id FROM sites WHERE subdomain = ?').bind(subdomain).first();
  if (dup) return err('이미 사용 중인 서브도메인입니다.');

  const siteId = genId();

  // 사이트 DB에 우선 provisioning 상태로 저장
  const domain = env.SITE_DOMAIN || 'cloudpress.site';
  await env.DB.prepare(
    `INSERT INTO sites (id, user_id, name, subdomain, status, php_version, region, plan)
     VALUES (?, ?, ?, ?, 'provisioning', ?, ?, ?)`
  ).bind(siteId, userId, name.trim(), subdomain, php_version, region, plan).run();

  // InstaWP API로 실제 WordPress 인스턴스 생성 (비동기)
  // 응답 먼저 보내고 백그라운드에서 프로비저닝
  const siteRecord = {
    id: siteId,
    user_id: userId,
    name: name.trim(),
    subdomain,
    status: 'provisioning',
    php_version,
    region,
    plan,
    created_at: Math.floor(Date.now() / 1000),
  };

  // 비동기 프로비저닝 시작 (waitUntil 없이도 동작, but waitUntil이 있으면 더 좋음)
  provisionWordPress(env, siteId, subdomain, name, php_version).catch(e => {
    console.error('Provisioning error:', e);
  });

  return ok({ site: siteRecord });
}

/* ── InstaWP API로 실제 WordPress 인스턴스 생성 ── */
async function provisionWordPress(env, siteId, subdomain, siteName, phpVersion) {
  const apiKey = env.INSTAWP_API_KEY;

  if (!apiKey) {
    // API 키가 없으면 데모 모드로 설정
    console.log('InstaWP API key not set, using demo mode');
    await sleep(3000);
    const domain = env.SITE_DOMAIN || 'cloudpress.site';
    await env.DB.prepare(
      `UPDATE sites SET
        status = 'active',
        wp_url = ?,
        wp_admin_url = ?,
        wp_username = 'admin',
        wp_password = ?
       WHERE id = ?`
    ).bind(
      `https://${subdomain}.${domain}`,
      `https://${subdomain}.${domain}/wp-admin`,
      generatePassword(),
      siteId
    ).run();
    return;
  }

  try {
    // InstaWP API v2 호출
    const resp = await fetch('https://app.instawp.io/api/v2/sites', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        name: siteName,
        wp_subdomain: subdomain,
        php_version: phpVersion,
        is_temporary: false,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.error('InstaWP error:', resp.status, errText);
      await env.DB.prepare('UPDATE sites SET status = ? WHERE id = ?')
        .bind('error', siteId).run();
      return;
    }

    const data = await resp.json();
    const site = data.data || data;

    // InstaWP 응답에서 크리덴셜 추출
    const wpUrl = site.url || site.wp_url || `https://${site.site_name || subdomain}.instawp.xyz`;
    const wpAdmin = wpUrl.replace(/\/$/, '') + '/wp-admin';
    const wpUser = site.wp_username || site.admin_username || 'admin';
    const wpPass = site.wp_password || site.admin_password || generatePassword();
    const instawpId = site.id || site.site_id || '';

    await env.DB.prepare(
      `UPDATE sites SET
        status = 'active',
        instawp_site_id = ?,
        wp_url = ?,
        wp_admin_url = ?,
        wp_username = ?,
        wp_password = ?
       WHERE id = ?`
    ).bind(instawpId, wpUrl, wpAdmin, wpUser, wpPass, siteId).run();

  } catch (e) {
    console.error('WordPress provisioning failed:', e);
    await env.DB.prepare('UPDATE sites SET status = ? WHERE id = ?')
      .bind('error', siteId).run();
  }
}

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map(b => chars[b % chars.length]).join('');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
