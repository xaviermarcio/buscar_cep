/**
 * CEP_ — Buscar Endereço
 * cep.js — lógica principal
 *
 * Funcionalidades:
 *  - Busca individual com validação robusta
 *  - Busca em lote (até 10 CEPs) com throttle
 *  - Histórico persistido (localStorage) com endereço
 *  - Exportação CSV do lote
 *  - Dark / Light mode persistido
 *  - Status online/offline em tempo real
 *  - PWA: registro do Service Worker
 */

'use strict';

/* ───────────────────────────────────────────
   CONSTANTES
─────────────────────────────────────────── */
const HISTORY_KEY   = 'cep_v2_history';
const THEME_KEY     = 'cep_v2_theme';
const MAX_HISTORY   = 10;
const MAX_BATCH     = 10;
const BATCH_DELAY   = 150; // ms entre requisições

/* ───────────────────────────────────────────
   UTILITÁRIOS
─────────────────────────────────────────── */

/** Mascara o valor do input: 00000-000 */
function maskCep(el) {
  let v = el.value.replace(/\D/g, '').slice(0, 8);
  if (v.length > 5) v = v.slice(0, 5) + '-' + v.slice(5);
  el.value = v;
}

/** Extrai somente dígitos e valida 8 dígitos */
function sanitizeCep(raw) {
  return (raw || '').replace(/\D/g, '');
}

function isValidCep(c) {
  if (!/^\d{8}$/.test(c)) return false;
  // Rejeita sequências triviais (00000000, 11111111…)
  if (/^(\d)\1{7}$/.test(c)) return false;
  return true;
}

/** Formata dígitos para exibição: 00000-000 */
function formatCep(digits) {
  return digits.slice(0, 5) + '-' + digits.slice(5);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* ───────────────────────────────────────────
   TEMA
─────────────────────────────────────────── */

function initTheme() {
  const saved  = localStorage.getItem(THEME_KEY);
  const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved || system);
}

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme);
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = theme === 'dark' ? '☀' : '☾';
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const current = document.body.getAttribute('data-theme') || 'dark';
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ───────────────────────────────────────────
   ONLINE / OFFLINE
─────────────────────────────────────────── */

function updateStatus() {
  const badge = document.getElementById('status-badge');
  const text  = badge && badge.querySelector('.status-text');
  if (!badge) return;

  if (navigator.onLine) {
    badge.className = 'status-badge online';
    if (text) text.textContent = 'online';
  } else {
    badge.className = 'status-badge offline';
    if (text) text.textContent = 'offline';
  }
}

window.addEventListener('online',  updateStatus);
window.addEventListener('offline', updateStatus);

/* ───────────────────────────────────────────
   API
─────────────────────────────────────────── */

/**
 * Consulta a ViaCEP.
 * Lança Error com mensagem amigável nos erros esperados.
 */
async function fetchCep(digits) {
  if (!navigator.onLine) {
    throw new Error('Sem conexão com a internet.');
  }

  let response;
  try {
    response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, {
      signal: AbortSignal.timeout(8000)
    });
  } catch (err) {
    if (err.name === 'TimeoutError') {
      throw new Error('Tempo de resposta esgotado. Tente novamente.');
    }
    throw new Error('Não foi possível conectar ao servidor.');
  }

  if (!response.ok) {
    throw new Error(`Erro HTTP ${response.status}. Tente novamente.`);
  }

  const data = await response.json();

  if (data.erro) {
    throw new Error('CEP não encontrado na base dos Correios.');
  }

  return data;
}

/* ───────────────────────────────────────────
   HISTÓRICO
─────────────────────────────────────────── */

function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

/**
 * Salva item no histórico: { cep, logradouro, bairro, cidade, uf }
 */
function saveHistory(item) {
  let h = getHistory().filter(x => x.cep !== item.cep);
  h.unshift(item);
  if (h.length > MAX_HISTORY) h = h.slice(0, MAX_HISTORY);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h));
  } catch {
    /* storage cheio — ignora */
  }
  renderHistoryPanel();
}

function limparHistorico() {
  if (!confirm('Limpar todo o histórico de buscas?')) return;
  localStorage.removeItem(HISTORY_KEY);
  renderHistoryPanel();
}

function renderHistoryPanel() {
  const list  = document.getElementById('history-full-list');
  const empty = document.getElementById('history-empty');
  if (!list) return;

  const h = getHistory();
  list.innerHTML = '';

  if (!h.length) {
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';

  h.forEach(item => {
    const li   = document.createElement('li');
    li.className = 'history-full-item';
    li.setAttribute('role', 'button');
    li.setAttribute('tabindex', '0');
    li.setAttribute('aria-label', `Buscar novamente ${formatCep(item.cep)}`);

    li.innerHTML = `
      <div>
        <div class="history-item-cep">${formatCep(item.cep)}</div>
        <div class="history-item-addr">${item.logradouro || '—'}, ${item.cidade || '—'} - ${item.uf || '—'}</div>
      </div>
      <span class="history-item-arrow">→</span>
    `;

    const handleClick = () => {
      switchTab('individual', document.getElementById('tab-individual'));
      document.getElementById('cep-input').value = formatCep(item.cep);
      buscarIndividual();
    };

    li.addEventListener('click', handleClick);
    li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') handleClick(); });
    list.appendChild(li);
  });
}

/* ───────────────────────────────────────────
   TOAST
─────────────────────────────────────────── */

let _toastTimer = null;

function showToast(msg = 'Endereço copiado') {
  const toast = document.getElementById('toast');
  const label = document.getElementById('toast-msg');
  if (!toast) return;
  if (_toastTimer) clearTimeout(_toastTimer);
  if (label) label.textContent = msg;
  toast.classList.add('show');
  _toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
}

/* ───────────────────────────────────────────
   SKELETON
─────────────────────────────────────────── */

function showSkeleton() {
  const sk = document.getElementById('skeleton-card');
  if (sk) { sk.classList.add('show'); sk.removeAttribute('aria-hidden'); }
}

function hideSkeleton() {
  const sk = document.getElementById('skeleton-card');
  if (sk) { sk.classList.remove('show'); sk.setAttribute('aria-hidden', 'true'); }
}

/* ───────────────────────────────────────────
   BUSCA INDIVIDUAL
─────────────────────────────────────────── */

function limparIndividual() {
  document.getElementById('cep-input').value   = '';
  document.getElementById('error-msg').textContent = '';
  document.getElementById('result-card').classList.remove('show');
}

async function buscarIndividual() {
  const input   = document.getElementById('cep-input');
  const errorEl = document.getElementById('error-msg');
  const card    = document.getElementById('result-card');

  errorEl.textContent = '';
  card.classList.remove('show');
  hideSkeleton();

  const digits = sanitizeCep(input.value);

  if (!digits) {
    errorEl.textContent = 'Digite um CEP.';
    input.focus();
    return;
  }
  if (!isValidCep(digits)) {
    errorEl.textContent = 'CEP inválido — informe 8 dígitos.';
    input.focus();
    return;
  }

  showSkeleton();

  try {
    const d = await fetchCep(digits);
    hideSkeleton();
    preencherResultado(d);
    card.classList.add('show');

    saveHistory({
      cep:        sanitizeCep(d.cep),
      logradouro: d.logradouro || '',
      bairro:     d.bairro    || '',
      cidade:     d.localidade || '',
      uf:         d.uf        || ''
    });
  } catch (err) {
    hideSkeleton();
    errorEl.textContent = err.message;
  }
}

function preencherResultado(d) {
  document.getElementById('res-cep').textContent    = d.cep;
  document.getElementById('res-log').textContent    = d.logradouro  || '—';
  document.getElementById('res-bairro').textContent = d.bairro      || '—';
  document.getElementById('res-cidade').textContent = d.localidade  || '—';
  document.getElementById('res-uf').textContent     = d.uf          || '—';
  document.getElementById('res-comp').textContent   = d.complemento || '—';
  document.getElementById('res-ddd').textContent    = d.ddd         || '—';
  document.getElementById('res-ibge').textContent   = d.ibge ? `IBGE ${d.ibge}` : '';
}

/* ───────────────────────────────────────────
   COPIAR / COMPARTILHAR
─────────────────────────────────────────── */

function montarTextoEndereco() {
  const linhas = [
    document.getElementById('res-cep').textContent,
    document.getElementById('res-log').textContent,
    document.getElementById('res-comp').textContent,
    document.getElementById('res-bairro').textContent,
    `${document.getElementById('res-cidade').textContent} - ${document.getElementById('res-uf').textContent}`
  ].filter(l => l && l !== '—');
  return linhas.join('\n');
}

function copiarEndereco() {
  const texto = montarTextoEndereco();
  if (!texto) return;

  navigator.clipboard.writeText(texto).then(() => {
    const btn   = document.getElementById('copy-btn');
    const label = document.getElementById('copy-label');
    label.textContent = '[ copiado ✓ ]';
    btn.classList.add('copied');
    showToast('Endereço copiado');
    setTimeout(() => {
      label.textContent = '[ copiar endereço ]';
      btn.classList.remove('copied');
    }, 2500);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.position = 'fixed';
    ta.style.opacity  = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Endereço copiado');
  });
}

function compartilhar() {
  const cep   = document.getElementById('res-cep').textContent;
  const texto = montarTextoEndereco();
  if (!texto) return;

  if (navigator.share) {
    navigator.share({ title: `CEP ${cep}`, text: texto }).catch(() => {});
  } else {
    copiarEndereco();
  }
}

/* ───────────────────────────────────────────
   BUSCA EM LOTE
─────────────────────────────────────────── */

let batchData = []; // para exportação CSV

async function buscarBatch() {
  const raw     = document.getElementById('batch-input').value;
  const results = document.getElementById('batch-results');
  const loader  = document.getElementById('loader-batch');
  const prog    = document.getElementById('batch-progress');
  const exportRow = document.getElementById('batch-export-row');

  results.innerHTML = '';
  batchData = [];

  const ceps = [...new Set(
    raw.split('\n')
       .map(l => sanitizeCep(l.trim()))
       .filter(isValidCep)
  )].slice(0, MAX_BATCH);

  if (!ceps.length) {
    results.innerHTML = '<p class="hint-text" style="padding:0.5rem 0">Nenhum CEP válido encontrado. Verifique os valores.</p>';
    if (exportRow) exportRow.style.display = 'none';
    return;
  }

  loader.classList.add('show');
  if (exportRow) exportRow.style.display = 'none';

  for (let i = 0; i < ceps.length; i++) {
    prog.textContent = `consultando ${i + 1}/${ceps.length}...`;
    const c = ceps[i];

    try {
      const d = await fetchCep(c);
      const addr = [d.logradouro, d.bairro, `${d.localidade} - ${d.uf}`]
        .filter(Boolean).join(', ');

      results.innerHTML += `
        <div class="batch-item ok">
          <div class="batch-item-cep">${d.cep}</div>
          <div class="batch-item-addr">${addr}</div>
        </div>`;

      batchData.push({
        cep:        d.cep,
        logradouro: d.logradouro  || '',
        complemento:d.complemento || '',
        bairro:     d.bairro      || '',
        cidade:     d.localidade  || '',
        uf:         d.uf          || '',
        ddd:        d.ddd         || '',
        ibge:       d.ibge        || ''
      });
    } catch (err) {
      results.innerHTML += `
        <div class="batch-item err">
          <div class="batch-item-cep">${formatCep(c)}</div>
          <div class="batch-item-addr err-text">${err.message}</div>
        </div>`;
    }

    if (i < ceps.length - 1) await sleep(BATCH_DELAY);
  }

  loader.classList.remove('show');
  if (batchData.length && exportRow) exportRow.style.display = 'flex';
}

/* ───────────────────────────────────────────
   EXPORTAR CSV
─────────────────────────────────────────── */

function exportarCSV() {
  if (!batchData.length) return;

  const headers = ['CEP', 'Logradouro', 'Complemento', 'Bairro', 'Cidade', 'UF', 'DDD', 'IBGE'];
  const rows = batchData.map(d => [
    d.cep, d.logradouro, d.complemento,
    d.bairro, d.cidade, d.uf, d.ddd, d.ibge
  ].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','));

  const csv  = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `ceps_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ───────────────────────────────────────────
   TABS
─────────────────────────────────────────── */

function switchTab(name, btn) {
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

  btn.classList.add('active');
  btn.setAttribute('aria-selected', 'true');

  const panel = document.getElementById('panel-' + name);
  if (panel) panel.classList.add('active');

  // Atualiza histórico ao entrar na tab
  if (name === 'historico') renderHistoryPanel();
}

/* ───────────────────────────────────────────
   PWA — SERVICE WORKER
─────────────────────────────────────────── */

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      console.log('[PWA] SW registrado:', reg.scope);

      const footer = document.getElementById('footer-pwa-status');
      if (footer) footer.textContent = 'PWA instalável';

      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            if (confirm('Nova versão disponível. Atualizar agora?')) {
              nw.postMessage({ type: 'SKIP_WAITING' });
              window.location.reload();
            }
          }
        });
      });
    } catch (err) {
      console.warn('[PWA] SW não registrado:', err);
    }
  });
}

/* ───────────────────────────────────────────
   INIT
─────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  updateStatus();
  renderHistoryPanel();
});
