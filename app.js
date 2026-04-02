/* CloudPress — app.js v2.0 — 실제 백엔드 API 연동 */
'use strict';

const CP = {
  // ── 토큰 관리 (sessionStorage — 탭 단위) ──
  TOKEN_KEY: 'cp_token',
  USER_KEY: 'cp_user',

  getToken() { return sessionStorage.getItem(this.TOKEN_KEY) || localStorage.getItem(this.TOKEN_KEY); },
  setToken(t) {
    sessionStorage.setItem(this.TOKEN_KEY, t);
    localStorage.setItem(this.TOKEN_KEY, t); // 재방문 대비
  },
  clearToken() {
    sessionStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.TOKEN_KEY);
    sessionStorage.removeItem(this.USER_KEY);
    localStorage.removeItem(this.USER_KEY);
  },

  getUser() {
    try {
      return JSON.parse(sessionStorage.getItem(this.USER_KEY) || localStorage.getItem(this.USER_KEY) || 'null');
    } catch { return null; }
  },
  setUser(u) {
    const s = JSON.stringify(u);
    sessionStorage.setItem(this.USER_KEY, s);
    localStorage.setItem(this.USER_KEY, s);
  },

  // ── API 기본 헬퍼 ──
  async api(path, options = {}) {
    const token = this.getToken();
    const res = await fetch('/api' + path, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    let data;
    try { data = await res.json(); } catch { data = { ok: false, error: '서버 오류' }; }

    if (res.status === 401) {
      this.clearToken();
      window.location.href = '/auth.html';
      return data;
    }

    return data;
  },

  async get(path) { return this.api(path, { method: 'GET' }); },
  async post(path, body) { return this.api(path, { method: 'POST', body: JSON.stringify(body) }); },
  async put(path, body) { return this.api(path, { method: 'PUT', body: JSON.stringify(body) }); },
  async del(path) { return this.api(path, { method: 'DELETE' }); },

  // ── 인증 ──
  async register(name, email, password) {
    const data = await this.post('/auth/register', { name, email, password });
    if (data.ok) {
      this.setToken(data.token);
      this.setUser(data.user);
    }
    return data;
  },

  async login(email, password) {
    const data = await this.post('/auth/login', { email, password });
    if (data.ok) {
      this.setToken(data.token);
      this.setUser(data.user);
    }
    return data;
  },

  async logout() {
    await this.post('/auth/logout', {});
    this.clearToken();
    window.location.href = '/';
  },

  // ── 세션 확인 ──
  async requireAuth() {
    const token = this.getToken();
    if (!token) { window.location.href = '/auth.html'; return false; }

    // 캐시된 유저가 있으면 빠르게 반환
    const cached = this.getUser();
    if (cached) return cached;

    // 서버에서 검증
    const data = await this.get('/auth/me');
    if (!data.ok) {
      this.clearToken();
      window.location.href = '/auth.html';
      return false;
    }
    this.setUser(data.user);
    return data.user;
  },

  async requireGuest() {
    const token = this.getToken();
    if (!token) return true;

    const data = await this.get('/auth/me');
    if (data.ok) {
      window.location.href = '/dashboard.html';
      return false;
    }
    this.clearToken();
    return true;
  },

  // ── 사이트 API ──
  async getSites() {
    const data = await this.get('/sites');
    return data.ok ? data.sites : [];
  },

  async getSite(id) {
    const data = await this.get(`/sites/${id}`);
    return data.ok ? data.site : null;
  },

  async createSite(payload) {
    return this.post('/sites', payload);
  },

  async deleteSite(id) {
    return this.del(`/sites/${id}`);
  },

  async setSiteCustomDomain(id, custom_domain) {
    return this.put(`/sites/${id}`, { custom_domain });
  },

  async pollSiteStatus(id) {
    return this.get(`/sites/${id}`);
  },

  // ── 유저 API ──
  async getProfile() {
    const data = await this.get('/user');
    return data.ok ? data.user : null;
  },

  async updateProfile(payload) {
    return this.put('/user', payload);
  },

  // ── 유틸 ──
  formatDate(ts) {
    if (!ts) return '—';
    const d = ts > 1e10 ? new Date(ts) : new Date(ts * 1000);
    return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
  },

  planInfo(plan) {
    const plans = {
      starter:    { name: '스타터',      price: '9,900',  sites: 1,  storage: '20GB',  color: '#6366f1' },
      pro:        { name: '프로',        price: '29,900', sites: 5,  storage: '100GB', color: '#f97316' },
      enterprise: { name: '엔터프라이즈', price: '99,000', sites: -1, storage: '무제한', color: '#ec4899' },
      free:       { name: '무료',        price: '0',      sites: 1,  storage: '5GB',   color: '#6b7280' },
    };
    return plans[plan] || plans.free;
  },

  statusBadge(status) {
    const map = {
      active:       { label: '활성',      color: '#22c55e' },
      provisioning: { label: '설치 중',   color: '#f97316' },
      error:        { label: '오류',      color: '#ef4444' },
      stopped:      { label: '중지됨',    color: '#6b7280' },
    };
    return map[status] || map.stopped;
  },
};

/* ── 공통 Toast ── */
function showToast(msg, type = 'info') {
  let el = document.getElementById('cp-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'cp-toast';
    document.body.appendChild(el);
  }
  el.className = 'cp-toast ' + type;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3500);
}

/* ── 사이드바 ── */
function openSidebar() {
  document.getElementById('sidebar')?.classList.add('open');
  document.getElementById('overlay')?.classList.add('show');
}
function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('overlay')?.classList.remove('show');
}
