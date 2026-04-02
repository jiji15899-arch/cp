// functions/api/auth/me.js
import { err, ok, getSession, getUserById, handleOptions } from '../../_lib/utils.js';

export async function onRequestOptions() { return handleOptions(); }

export async function onRequestGet({ request, env }) {
  const userId = await getSession(env, request);
  if (!userId) return err('인증이 필요합니다.', 401);

  const user = await getUserById(env, userId);
  if (!user) return err('사용자를 찾을 수 없습니다.', 404);

  return ok({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      plan: user.plan,
      created_at: user.created_at,
    }
  });
}
