// functions/_lib/utils.js — 공통 유틸리티

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export function err(msg, status = 400) {
  return json({ ok: false, error: msg }, status);
}

export function ok(data = {}) {
  return json({ ok: true, ...data });
}

// 간단한 SHA-256 해시 (Web Crypto API)
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + ':cloudpress_salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 세션 토큰 생성
export function genToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// 랜덤 ID 생성
export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// 요청에서 세션 토큰 추출
export function getToken(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  // 쿠키에서도 확인
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/cp_session=([^;]+)/);
  return m ? m[1] : null;
}

// KV에서 세션 검증 → userId 반환
export async function getSession(env, request) {
  const token = getToken(request);
  if (!token) return null;
  const userId = await env.SESSIONS.get(`session:${token}`);
  return userId || null;
}

// DB에서 유저 조회
export async function getUserById(env, id) {
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
  return row;
}

// CORS preflight 처리
export function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
