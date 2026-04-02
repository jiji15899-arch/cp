// functions/api/auth/register.js
import { json, err, ok, hashPassword, genToken, genId, handleOptions } from '../../_lib/utils.js';

export async function onRequestOptions() { return handleOptions(); }

export async function onRequestPost({ request, env }) {
  try {
    const { name, email, password } = await request.json();

    if (!name || !email || !password)
      return err('이름, 이메일, 비밀번호를 모두 입력해주세요.');
    if (password.length < 6)
      return err('비밀번호는 6자 이상이어야 합니다.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return err('올바른 이메일 형식이 아닙니다.');

    // 중복 이메일 체크
    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
    if (existing) return err('이미 사용 중인 이메일입니다.');

    const id = genId();
    const hash = await hashPassword(password);

    await env.DB.prepare(
      'INSERT INTO users (id, name, email, password_hash, plan) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, name.trim(), email.toLowerCase(), hash, 'free').run();

    // 세션 생성
    const token = genToken();
    await env.SESSIONS.put(`session:${token}`, id, { expirationTtl: 7 * 86400 });

    return ok({
      token,
      user: { id, name: name.trim(), email: email.toLowerCase(), plan: 'free' }
    });
  } catch (e) {
    console.error('register error:', e);
    return err('서버 오류가 발생했습니다.', 500);
  }
}
