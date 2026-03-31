/**
 * auth.js — CinéRank · Autenticação com Supabase
 * ─────────────────────────────────────────────────────────────
 * Inclua ANTES do script.js no index.html:
 *
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="auth.js"></script>
 *   <script src="script.js"></script>
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

// ── Configuração Supabase ──────────────────────────────────────
const SUPABASE_URL     = 'https://nqaqgcjhvldlbstwpags.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xYXFnY2podmxkbGJzdHdwYWdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5MDc1NzAsImV4cCI6MjA5MDQ4MzU3MH0.N0auhzzdXUKAAJVrgwY37n_dOSHR_GEoOtZSdTKYYxg';

// Proteção: só cria o client se as credenciais foram configuradas
const SUPABASE_CONFIGURED = (
  !SUPABASE_URL.includes('SEU_PROJETO') && !SUPABASE_ANON_KEY.includes('sua_anon_key')
);
const _supabase = SUPABASE_CONFIGURED
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

// ── Estado de autenticação global ────────────────────────────
window.currentUser  = null;   // objeto do usuário Supabase
window.sessionToken = null;   // JWT para enviar ao Flask

// ─────────────────────────────────────────────────────────────
// INICIALIZAÇÃO — verifica se já há sessão ativa
// ─────────────────────────────────────────────────────────────
async function initAuth() {
  // Se Supabase não está configurado, entra em modo offline direto
  if (!_supabase) {
    console.warn('CinéRank: Supabase não configurado — modo offline ativado.');
    return;
  }

  try {
    const { data: { session } } = await _supabase.auth.getSession();

    if (session) {
      window.currentUser  = session.user;
      window.sessionToken = session.access_token;
      onLoginSuccess(session.user);
    } else {
      showAuthModal();
    }

    // Escuta mudanças de sessão (login, logout, refresh de token)
    _supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        window.currentUser  = session.user;
        window.sessionToken = session.access_token;
      } else {
        window.currentUser  = null;
        window.sessionToken = null;
      }
    });
  } catch (err) {
    console.error('Erro ao inicializar auth:', err);
    // Não bloqueia o app — continua em modo offline
  }
}

// ─────────────────────────────────────────────────────────────
// SIGN UP
// ─────────────────────────────────────────────────────────────
async function signUp(email, password) {
  if (!_supabase) throw new Error('Supabase não configurado');
  const { data, error } = await _supabase.auth.signUp({ email, password });
  if (error) throw new Error(error.message);

  // Supabase envia e-mail de confirmação por padrão
  // Você pode desativar isso em Auth → Settings no dashboard
  return data;
}

// ─────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────
async function signIn(email, password) {
  if (!_supabase) throw new Error('Supabase não configurado');
  const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);

  window.currentUser  = data.user;
  window.sessionToken = data.session.access_token;
  return data;
}

// ─────────────────────────────────────────────────────────────
// LOGIN COM GOOGLE (OAuth) — opcional
// ─────────────────────────────────────────────────────────────
async function signInWithGoogle() {
  const { error } = await _supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) throw new Error(error.message);
}

// ─────────────────────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────────────────────
async function signOut() {
  await _supabase.auth.signOut();
  window.currentUser  = null;
  window.sessionToken = null;
  // Limpa estado local e recarrega
  localStorage.clear();
  location.reload();
}

// ─────────────────────────────────────────────────────────────
// SALVAR LISTA NO SUPABASE (via Flask backend)
// Chame isso após markWatched() ou pickWinner()
// ─────────────────────────────────────────────────────────────
async function saveListToServer(watchedIds, eloScores) {
  if (!window.sessionToken) return; // não está logado

  const movies = [...watchedIds].map((id) => ({
    movie_id:  id,
    elo_score: eloScores[id] || 1200,
    added_at:  new Date().toISOString(),
  }));

  try {
    await fetch('http://127.0.0.1:5000/user/list', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${window.sessionToken}`,
      },
      body: JSON.stringify({ movies }),
    });
  } catch (e) {
    console.warn('Erro ao salvar lista:', e);
  }
}

// ─────────────────────────────────────────────────────────────
// CARREGAR LISTA DO SERVIDOR
// ─────────────────────────────────────────────────────────────
async function loadListFromServer() {
  if (!window.sessionToken) return null;

  try {
    const res  = await fetch('http://127.0.0.1:5000/user/list', {
      headers: { 'Authorization': `Bearer ${window.sessionToken}` },
    });
    return await res.json(); // [{movie_id, elo_score, added_at}]
  } catch (e) {
    console.warn('Erro ao carregar lista:', e);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// MODAL DE LOGIN/SIGNUP (injeta no DOM automaticamente)
// ─────────────────────────────────────────────────────────────
function showAuthModal() {
  // Remove modal anterior se existir
  document.getElementById('auth-modal-backdrop')?.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'auth-modal-backdrop';
  backdrop.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,.85);
    display:flex;align-items:center;justify-content:center;
    z-index:9999;backdrop-filter:blur(6px);
  `;

  backdrop.innerHTML = `
    <div id="auth-modal" style="
      background:var(--bg-surface,#1a1a2e);
      border:1px solid rgba(255,255,255,.1);
      border-radius:16px;padding:2.5rem 2rem;
      width:min(380px,90vw);color:var(--text-primary,#fff);
      font-family:'DM Sans',sans-serif;
    ">
      <div style="text-align:center;margin-bottom:1.5rem;">
        <div style="font-size:2rem;margin-bottom:.4rem;">⬡</div>
        <h2 style="font-family:'Bebas Neue',sans-serif;font-size:1.8rem;
                   letter-spacing:.06em;margin:0;">CinéRank</h2>
        <p style="color:var(--text-secondary,#888);font-size:.85rem;margin:.4rem 0 0;">
          Entre para salvar sua lista de filmes
        </p>
      </div>

      <!-- Abas -->
      <div style="display:flex;gap:.5rem;margin-bottom:1.5rem;">
        <button id="tab-login" onclick="switchAuthTab('login')" style="
          flex:1;padding:.6rem;border:none;border-radius:8px;cursor:pointer;
          background:var(--accent,#e8a020);color:#000;font-weight:600;
        ">Entrar</button>
        <button id="tab-signup" onclick="switchAuthTab('signup')" style="
          flex:1;padding:.6rem;border:none;border-radius:8px;cursor:pointer;
          background:rgba(255,255,255,.08);color:var(--text-primary,#fff);
        ">Criar conta</button>
      </div>

      <!-- Formulário -->
      <div style="display:flex;flex-direction:column;gap:.8rem;">
        <input id="auth-email" type="email" placeholder="E-mail" style="
          padding:.75rem 1rem;border-radius:8px;border:1px solid rgba(255,255,255,.15);
          background:rgba(255,255,255,.06);color:#fff;font-size:.95rem;outline:none;
        "/>
        <input id="auth-password" type="password" placeholder="Senha" style="
          padding:.75rem 1rem;border-radius:8px;border:1px solid rgba(255,255,255,.15);
          background:rgba(255,255,255,.06);color:#fff;font-size:.95rem;outline:none;
        "/>
        <p id="auth-error" style="color:#ff6b6b;font-size:.82rem;margin:0;display:none;"></p>
        <button id="auth-submit" onclick="handleAuthSubmit()" style="
          padding:.8rem;border-radius:8px;border:none;cursor:pointer;
          background:var(--accent,#e8a020);color:#000;font-weight:700;font-size:1rem;
        ">Entrar</button>
      </div>

      <!-- Google OAuth -->
      <div style="margin:1rem 0;text-align:center;color:var(--text-secondary,#888);font-size:.8rem;">
        — ou —
      </div>
      <button onclick="signInWithGoogle()" style="
        width:100%;padding:.75rem;border-radius:8px;border:1px solid rgba(255,255,255,.15);
        background:rgba(255,255,255,.06);color:#fff;cursor:pointer;font-size:.9rem;
        display:flex;align-items:center;justify-content:center;gap:.6rem;
      ">
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.3 6.8 29.4 4.5 24 4.5 12.7 4.5 3.5 13.7 3.5 25S12.7 45.5 24 45.5c11 0 20-8 20-20 0-1.3-.1-2.7-.4-4z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.8 19 12.5 24 12.5c3.1 0 5.8 1.1 8 2.9l5.7-5.7C34.3 6.8 29.4 4.5 24 4.5c-7.8 0-14.5 4.4-18 10.7 0 0 .3-.5.3-.5z"/>
          <path fill="#4CAF50" d="M24 45.5c5.3 0 10.1-2 13.7-5.2l-6.3-5.3C29.5 36.8 26.9 38 24 38c-5.2 0-9.6-3.3-11.2-8l-6.5 5c3.5 6.2 10.1 10.5 17.7 10.5z"/>
          <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4-4 5.3l6.3 5.3C41.7 35.8 44 31 44 25c0-1.3-.1-2.7-.4-4z"/>
        </svg>
        Continuar com Google
      </button>

      <!-- Pular login (modo offline) -->
      <div style="text-align:center;margin-top:1rem;">
        <button onclick="skipLogin()" style="
          background:none;border:none;color:var(--text-secondary,#888);
          cursor:pointer;font-size:.8rem;text-decoration:underline;
        ">Continuar sem conta (dados ficam só no navegador)</button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);
}

// Alterna entre aba de login e signup
window.currentAuthTab = 'login';
window.switchAuthTab = function(tab) {
  window.currentAuthTab = tab;
  const isLogin = tab === 'login';
  document.getElementById('auth-submit').textContent  = isLogin ? 'Entrar' : 'Criar conta';
  document.getElementById('tab-login').style.background  = isLogin ? 'var(--accent,#e8a020)' : 'rgba(255,255,255,.08)';
  document.getElementById('tab-login').style.color       = isLogin ? '#000' : '#fff';
  document.getElementById('tab-signup').style.background = isLogin ? 'rgba(255,255,255,.08)' : 'var(--accent,#e8a020)';
  document.getElementById('tab-signup').style.color      = isLogin ? '#fff' : '#000';
};

window.handleAuthSubmit = async function() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-error');
  const btn      = document.getElementById('auth-submit');

  errEl.style.display = 'none';
  btn.textContent = 'Aguarde…';
  btn.disabled    = true;

  try {
    if (window.currentAuthTab === 'login') {
      await signIn(email, password);
    } else {
      await signUp(email, password);
      errEl.textContent    = 'Verifique seu e-mail para confirmar o cadastro!';
      errEl.style.color    = '#4caf50';
      errEl.style.display  = 'block';
      btn.textContent      = 'Criar conta';
      btn.disabled         = false;
      return;
    }
    document.getElementById('auth-modal-backdrop')?.remove();
    onLoginSuccess(window.currentUser);
  } catch (e) {
    errEl.textContent   = e.message;
    errEl.style.color   = '#ff6b6b';
    errEl.style.display = 'block';
    btn.textContent     = window.currentAuthTab === 'login' ? 'Entrar' : 'Criar conta';
    btn.disabled        = false;
  }
};

window.skipLogin = function() {
  document.getElementById('auth-modal-backdrop')?.remove();
  console.info('CinéRank: modo offline — dados salvos apenas localmente.');
};

// ─────────────────────────────────────────────────────────────
// CALLBACK PÓS-LOGIN
// Sincroniza a lista salva no servidor com o estado local
// ─────────────────────────────────────────────────────────────
async function onLoginSuccess(user) {
  console.log('✓ Logado como', user.email);

  // Injeta avatar/nome na navbar se já existir
  const brand = document.querySelector('.nav-brand');
  if (brand && !document.getElementById('user-badge')) {
    const badge = document.createElement('span');
    badge.id = 'user-badge';
    badge.style.cssText = 'font-size:.75rem;color:var(--text-secondary,#888);margin-left:.5rem;cursor:pointer;';
    badge.textContent   = user.email.split('@')[0];
    badge.title         = 'Clique para sair';
    badge.onclick       = () => { if (confirm('Sair da conta?')) signOut(); };
    brand.appendChild(badge);
  }

  // Carrega lista do servidor e mescla com estado local
  const serverList = await loadListFromServer();
  if (serverList && Array.isArray(serverList) && typeof state !== 'undefined') {
    serverList.forEach(({ movie_id, elo_score }) => {
      state.watchedIds.add(movie_id);
      state.eloScores[movie_id] = elo_score;
    });

    if (typeof updateDiscoverCounter === 'function') updateDiscoverCounter();
    if (typeof renderRanking === 'function') renderRanking();
    console.log(`✓ ${serverList.length} filmes carregados do servidor.`);
  }
}

// ─────────────────────────────────────────────────────────────
// EXPOR FUNÇÕES GLOBAIS
// ─────────────────────────────────────────────────────────────
window.signIn           = signIn;
window.signUp           = signUp;
window.signOut          = signOut;
window.signInWithGoogle = signInWithGoogle;
window.saveListToServer = saveListToServer;
window.loadListFromServer = loadListFromServer;

// Inicializa ao carregar
document.addEventListener('DOMContentLoaded', initAuth);
