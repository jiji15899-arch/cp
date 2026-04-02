// functions/api/auth/logout.js
import { ok, getToken, handleOptions } from '../../_lib/utils.js';

export async function onRequestOptions() { return handleOptions(); }

export async function onRequestPost({ request, env }) {
  const token = getToken(request);
  if (token) await env.SESSIONS.delete(`session:${token}`);
  return ok({ message: '로그아웃되었습니다.' });
}
