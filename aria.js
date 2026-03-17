/**
 * ════════════════════════════════════════════════════════
 *  ARIA — Personal Productivity Assistant
 *  aria.js — Main Application Logic
 *
 *  Modules:
 *   1. Config & Constants
 *   2. App State
 *   3. Theme Manager
 *   4. System Prompt Builder
 *   5. UI Renderer (Welcome, Messages, Typing)
 *   6. Chat Engine (send, API call, context)
 *   7. Mode & Input Mode Controllers
 *   8. Utility Actions (newChat, export, panel)
 *   9. Event Binding & Init
 * ════════════════════════════════════════════════════════
 */

'use strict';

/* ─────────────────────────────────────────────────────────
   1. CONFIG & CONSTANTS
   ───────────────────────────────────────────────────────── */
const CONFIG = {
  // Mengarah ke proxy lokal (server.js).
  // API key (Gemini) disimpan aman di .env — tidak pernah ada di browser.
  API_URL:       '/api/chat',
  MODEL:         'gemini-2.0-flash',  // Info saja, model dipilih di server.js
  MAX_TOKENS:    1500,
  HISTORY_LIMIT: 7,
};

const MODE_LABELS = {
  general:  'Mode: Umum · Siap membantu Anda',
  schedule: 'Mode: Jadwal · Manajemen agenda & waktu',
  business: 'Mode: Bisnis · Analisis & strategi bisnis',
  decision: 'Mode: Keputusan · Framework pengambilan keputusan',
};

const INPUT_MODE_HINTS = {
  smart:    'Smart Mode — ARIA mendeteksi konteks otomatis',
  schedule: 'Mode Jadwal — Tanya tentang agenda atau meeting Anda',
  analysis: 'Mode Analisis — Minta analisis data atau laporan bisnis',
  decision: 'Mode Keputusan — Dapatkan framework untuk keputusan penting',
};

const THEME_CONFIG = {
  dark:  { icon: '🌙', label: 'Mode Terang', next: 'light' },
  light: { icon: '☀️', label: 'Mode Malam',  next: 'dark'  },
};

/* ─────────────────────────────────────────────────────────
   2. APP STATE
   ───────────────────────────────────────────────────────── */
const state = {
  mode:        'general',
  inputMode:   'smart',
  theme:       'dark',
  messages:    [],       // { role: 'user'|'ai', content: string }
  userContext: {},
  isLoading:   false,
};

/* ─────────────────────────────────────────────────────────
   3. THEME MANAGER
   ───────────────────────────────────────────────────────── */
const ThemeManager = {
  /** Read saved preference or system preference on first load */
  init() {
    const saved = localStorage.getItem('aria-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = saved || (prefersDark ? 'dark' : 'light');
    this.apply(theme, false);
  },

  /** Toggle between dark and light */
  toggle() {
    const next = THEME_CONFIG[state.theme].next;
    this.apply(next, true);
  },

  /** Apply a theme by name */
  apply(theme, save = true) {
    state.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    if (save) localStorage.setItem('aria-theme', theme);
    this._updateButton();
  },

  /** Update the toggle button text/icon */
  _updateButton() {
    const btn  = document.getElementById('themeToggleBtn');
    if (!btn) return;
    const cfg  = THEME_CONFIG[state.theme];
    btn.querySelector('.theme-icon').textContent  = cfg.icon;
    btn.querySelector('.theme-label').textContent = cfg.label;
  },
};

/* ─────────────────────────────────────────────────────────
   4. SYSTEM PROMPT BUILDER
   ───────────────────────────────────────────────────────── */
function buildSystemPrompt() {
  const now     = new Date();
  const dateStr = now.toLocaleDateString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  const ctxStr  = Object.keys(state.userContext).length
    ? JSON.stringify(state.userContext)
    : 'Belum ada konteks spesifik.';

  return `Kamu adalah ARIA (Adaptive Reasoning Intelligence Assistant), asisten produktivitas personal yang cerdas dan profesional berbahasa Indonesia.

Waktu saat ini : ${dateStr}, pukul ${timeStr}
Mode aktif     : ${state.mode}
Mode input     : ${state.inputMode}
Konteks user   : ${ctxStr}

## Kepribadian
- Profesional, hangat, dan proaktif
- Gunakan bahasa Indonesia yang natural dan formal
- Selalu berikan insight tambahan dan pertanyaan follow-up yang relevan
- Sesuaikan kedalaman respons dengan kompleksitas pertanyaan

## Kemampuan Utama

### Manajemen Jadwal & Produktivitas
- Atur dan prioritaskan jadwal harian/mingguan
- Buat agenda meeting yang terstruktur dan efektif
- Teknik manajemen waktu: Pomodoro, Time-Blocking, GTD, Eisenhower Matrix
- Identifikasi konflik jadwal dan rekomendasikan solusi

### Informasi & Analisis Bisnis
- Analisis tren industri dan pasar Indonesia
- Review performa bisnis, KPI, dan metrik penting
- Benchmark terhadap kompetitor dan best practice industri
- Identifikasi peluang pertumbuhan dan ancaman bisnis

### Pengambilan Keputusan Strategis
- Framework: SWOT, Decision Matrix, Weighted Scoring, Pros/Cons
- Analisis risiko bisnis beserta strategi mitigasinya
- Evaluasi multi-opsi dengan kriteria terbobot
- Rekomendasi strategis berbasis data dan konteks

### Produktivitas & Manajemen Tim
- Strategi peningkatan performa dan engagement tim
- Teknik delegasi yang efektif dan monitoring progres
- Komunikasi internal yang lebih produktif
- Pengembangan karyawan dan budaya kerja positif

## Format HTML yang Tersedia

Gunakan class berikut untuk respons terstruktur:

**Info Card:**
<div class="info-card">
  <div class="info-card-title">Judul</div>
  <div class="info-row"><span class="info-label">Label</span><span class="info-value">Nilai</span></div>
</div>

**Jadwal/Agenda:**
<div class="schedule-item">
  <div class="schedule-time">09:00</div>
  <div class="schedule-detail">
    <div class="schedule-title-text">Nama Event</div>
    <div class="schedule-sub">Deskripsi singkat</div>
  </div>
</div>

**Tabel Keputusan:**
<table class="decision-table">
  <thead><tr><th>Kriteria</th><th>Opsi A</th><th>Opsi B</th></tr></thead>
  <tbody><tr><td>...</td><td>...</td><td>...</td></tr></tbody>
</table>

**Chip/Badge:**
<span class="chip chip-blue">Prioritas Tinggi</span>
<span class="chip chip-green">Selesai</span>
<span class="chip chip-amber">Pending</span>
<span class="chip chip-red">Risiko</span>

**Teks biasa:** Gunakan <h3>, <p>, <ul>, <li> secara normal.

Selalu akhiri respons dengan minimal satu pertanyaan follow-up atau saran proaktif yang membantu user melangkah lebih jauh.`;
}

/* ─────────────────────────────────────────────────────────
   5. UI RENDERER
   ───────────────────────────────────────────────────────── */
const UI = {
  /** Escape HTML to prevent XSS in user messages */
  escapeHtml(text) {
    const d = document.createElement('div');
    d.appendChild(document.createTextNode(text));
    return d.innerHTML;
  },

  /** Current time string in HH:MM format */
  getTime() {
    return new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  },

  /** Show the welcome / starter screen */
  renderWelcome() {
    const area = document.getElementById('messagesArea');
    area.innerHTML = '';

    const starters = [
      { icon: '📅', title: 'Cek Jadwal',      desc: 'Agenda dan meeting minggu ini',    q: 'Apa jadwal dan meeting penting saya minggu ini?' },
      { icon: '📊', title: 'Analisis Bisnis', desc: 'Review KPI dan performa tim',      q: 'Bantu saya analisis performa bisnis bulan ini dan beri saran peningkatan' },
      { icon: '🎯', title: 'Bantu Keputusan', desc: 'Framework untuk pilihan sulit',    q: 'Saya perlu memilih antara dua vendor. Bantu saya buat kerangka keputusan yang baik.' },
      { icon: '🚀', title: 'Produktivitas Tim',desc: 'Strategi boost performa & efisiensi', q: 'Bagaimana cara meningkatkan produktivitas tim saya yang sedang menurun?' },
    ];

    const cards = starters.map(s =>
      `<div class="starter-card" data-starter="${this.escapeHtml(s.q)}">
         <div class="starter-card-icon">${s.icon}</div>
         <div class="starter-card-title">${s.title}</div>
         <div class="starter-card-desc">${s.desc}</div>
       </div>`
    ).join('');

    const ws = document.createElement('div');
    ws.id        = 'welcomeScreen';
    ws.className = 'welcome-screen';
    ws.innerHTML = `
      <div class="welcome-icon">⚡</div>
      <div class="welcome-title">Halo! Saya <span>ARIA</span></div>
      <div class="welcome-desc">
        Asisten produktivitas personal Anda. Siap membantu mengelola jadwal,
        memberikan informasi bisnis, menganalisis data, dan mendukung
        pengambilan keputusan strategis.
      </div>
      <div class="starter-grid">${cards}</div>`;

    area.appendChild(ws);

    // Bind starter card clicks
    ws.querySelectorAll('[data-starter]').forEach(el => {
      el.addEventListener('click', () => ChatEngine.send(el.dataset.starter));
    });
  },

  /** Remove welcome screen if present */
  removeWelcome() {
    const ws = document.getElementById('welcomeScreen');
    if (ws) ws.remove();
  },

  /** Append a message bubble */
  appendMessage(role, content) {
    this.removeWelcome();
    const area  = document.getElementById('messagesArea');
    const isAI  = role === 'ai';

    const div   = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = `
      <div class="msg-avatar ${role}">${isAI ? '⚡' : 'U'}</div>
      <div class="msg-content">
        <div class="msg-meta">
          <span class="msg-name">${isAI ? 'ARIA' : 'Anda'}</span>
          <span>${this.getTime()}</span>
        </div>
        <div class="msg-bubble">${content}</div>
      </div>`;

    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
  },

  /** Show animated typing indicator */
  showTyping() {
    this.removeWelcome();
    const area = document.getElementById('messagesArea');
    const div  = document.createElement('div');
    div.id        = 'typingIndicator';
    div.className = 'typing-indicator';
    div.innerHTML = `
      <div class="msg-avatar ai">⚡</div>
      <div class="typing-dots">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>`;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
  },

  /** Remove typing indicator */
  removeTyping() {
    const el = document.getElementById('typingIndicator');
    if (el) el.remove();
  },

  /** Render error message bubble */
  showError(msg) {
    const hint = 'Pastikan <code>server.js</code> sudah berjalan dengan perintah '
      + '<code>npm start</code>, dan file <code>.env</code> sudah berisi '
      + '<code>GEMINI_API_KEY</code> yang valid. '
      + 'Cek status: <a href="/health" target="_blank">/health</a>';
    this.appendMessage('ai',
      `<p>⚠️ <strong>Kesalahan:</strong> <code>${this.escapeHtml(msg)}</code></p><p>${hint}</p>`
    );
  },

  /** Update input hint text */
  setInputHint(text) {
    const el = document.getElementById('inputHint');
    if (el) el.textContent = text;
  },

  /** Update subtitle in chat header */
  setChatSubtitle(text) {
    const el = document.getElementById('chatSubtitle');
    if (el) el.textContent = text;
  },

  /** Auto-resize the textarea */
  autoResizeTextarea(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 150) + 'px';
  },

  /** Update the user context panel */
  updateContextPanel() {
    const el   = document.getElementById('userContext');
    if (!el) return;
    const entries = Object.values(state.userContext);
    if (entries.length === 0) {
      el.innerHTML = '<span style="color:var(--text3)">Belum ada konteks tersimpan.</span>';
    } else {
      el.innerHTML = entries
        .map(v => `<span class="chip chip-blue" style="display:inline-flex;margin:2px">${v}</span>`)
        .join('');
    }
  },

  /** Prepend a new history item in the sidebar */
  addHistoryItem(text) {
    const list  = document.getElementById('historyList');
    if (!list) return;
    const short = text.length > 38 ? text.substring(0, 38) + '…' : text;

    const btn   = document.createElement('button');
    btn.className     = 'topic-item';
    btn.dataset.starter = text;
    btn.innerHTML     = `<span class="topic-dot" style="background:var(--accent)"></span> ${this.escapeHtml(short)}`;
    btn.addEventListener('click', () => ChatEngine.send(text));

    if (list.children.length >= CONFIG.HISTORY_LIMIT) {
      list.removeChild(list.lastChild);
    }
    list.insertBefore(btn, list.firstChild);
  },
};

/* ─────────────────────────────────────────────────────────
   6. CHAT ENGINE
   ───────────────────────────────────────────────────────── */
const ChatEngine = {
  /** Main entry: send a user message */
  async send(customText) {
    const inputBox = document.getElementById('inputBox');
    const text     = customText || inputBox.value.trim();
    if (!text || state.isLoading) return;

    // Clear input if typed by user
    if (!customText) {
      inputBox.value = '';
      inputBox.style.height = 'auto';
      document.getElementById('sendBtn').disabled = true;
    }

    // Store & render user message
    state.messages.push({ role: 'user', content: text });
    UI.appendMessage('user', UI.escapeHtml(text));
    UI.showTyping();
    state.isLoading = true;

    try {
      const aiText = await this._callAPI();
      UI.removeTyping();
      state.messages.push({ role: 'ai', content: aiText });
      UI.appendMessage('ai', aiText);
      this._extractContext(text);
      UI.addHistoryItem(text);
    } catch (err) {
      UI.removeTyping();
      UI.showError(err.message);
    }

    state.isLoading = false;
  },

  /** Call the Anthropic API */
  async _callAPI() {
    // Build the messages array in Anthropic format
    const apiMessages = state.messages.map(m => ({
      role:    m.role === 'ai' ? 'assistant' : 'user',
      content: m.content,
    }));

    const response = await fetch(CONFIG.API_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:      CONFIG.MODEL,
        max_tokens: CONFIG.MAX_TOKENS,
        system:     buildSystemPrompt(),
        messages:   apiMessages,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.content?.map(b => b.text || '').join('') || 'Tidak ada respons dari ARIA.';
  },

  /** Detect context keywords from user message and update state */
  _extractContext(text) {
    const l   = text.toLowerCase();
    const ctx = state.userContext;

    if (/perusahaan|bisnis|startup|usaha|kantor/.test(l)) ctx.domain  = 'Bisnis';
    if (/tim|team|karyawan|staff|anggota/.test(l))        ctx.scope   = 'Memiliki tim';
    if (/produk|product|layanan|fitur/.test(l))           ctx.focus   = 'Produk/Layanan';
    if (/klien|client|customer|pelanggan/.test(l))        ctx.type    = 'B2B/B2C';
    if (/anggaran|budget|keuangan|modal/.test(l))         ctx.finance = 'Keuangan aktif';
    if (/proyek|project|milestone|deadline/.test(l))      ctx.pm      = 'Manajemen proyek';

    UI.updateContextPanel();
  },
};

/* ─────────────────────────────────────────────────────────
   7. MODE & INPUT MODE CONTROLLERS
   ───────────────────────────────────────────────────────── */
function setMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  UI.setChatSubtitle(MODE_LABELS[mode] || MODE_LABELS.general);
}

function setInputMode(inputMode) {
  state.inputMode = inputMode;
  document.querySelectorAll('.toolbar-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.inputMode === inputMode);
  });
  UI.setInputHint(INPUT_MODE_HINTS[inputMode] || INPUT_MODE_HINTS.smart);
}

/* ─────────────────────────────────────────────────────────
   8. UTILITY ACTIONS
   ───────────────────────────────────────────────────────── */

/** Start a completely fresh session */
function newChat() {
  state.messages    = [];
  state.userContext = {};
  UI.renderWelcome();
  UI.updateContextPanel();
  const inputBox = document.getElementById('inputBox');
  inputBox.value = '';
  inputBox.style.height = 'auto';
  document.getElementById('sendBtn').disabled = true;
}

/** Export conversation as plain text file */
function exportChat() {
  if (!state.messages.length) {
    alert('Belum ada percakapan untuk diekspor.');
    return;
  }

  const separator = '─'.repeat(52);
  const header    = `ARIA — Ekspor Percakapan\nTanggal: ${new Date().toLocaleString('id-ID')}\n${separator}\n\n`;
  const body      = state.messages
    .map(m => {
      const role      = m.role === 'ai' ? 'ARIA' : 'User';
      const plainText = m.content.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      return `[${role}]\n${plainText}\n`;
    })
    .join('\n');

  const blob = new Blob([header + body], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `ARIA-chat-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Toggle right panel visibility */
function togglePanel() {
  const panel = document.getElementById('rightPanel');
  if (!panel) return;
  const isHidden = panel.style.display === 'none';
  panel.style.display = isHidden ? '' : 'none';
}

/* ─────────────────────────────────────────────────────────
   9. EVENT BINDING & INIT
   ───────────────────────────────────────────────────────── */
function bindEvents() {
  // Send button
  document.getElementById('sendBtn')
    .addEventListener('click', () => ChatEngine.send());

  // Textarea: auto-resize + enable/disable send
  const inputBox = document.getElementById('inputBox');
  inputBox.addEventListener('input', function () {
    UI.autoResizeTextarea(this);
    document.getElementById('sendBtn').disabled = this.value.trim() === '';
  });

  // Textarea: Enter to send, Shift+Enter for newline
  inputBox.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ChatEngine.send();
    }
  });

  // Mode buttons (sidebar)
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });

  // Input mode toolbar buttons
  document.querySelectorAll('.toolbar-btn').forEach(btn => {
    btn.addEventListener('click', () => setInputMode(btn.dataset.inputMode));
  });

  // Sidebar history items (default)
  document.querySelectorAll('#historyList .topic-item').forEach(btn => {
    btn.addEventListener('click', () => ChatEngine.send(btn.dataset.starter));
  });

  // Right panel: schedule items
  document.querySelectorAll('.sched-item[data-starter]').forEach(el => {
    el.addEventListener('click', () => ChatEngine.send(el.dataset.starter));
  });

  // Right panel: quick tags
  document.querySelectorAll('.tag[data-starter]').forEach(el => {
    el.addEventListener('click', () => ChatEngine.send(el.dataset.starter));
  });

  // Header buttons
  document.getElementById('newChatBtn')
    .addEventListener('click', newChat);

  document.getElementById('exportBtn')
    .addEventListener('click', exportChat);

  document.getElementById('togglePanelBtn')
    .addEventListener('click', togglePanel);

  // Theme toggle
  document.getElementById('themeToggleBtn')
    .addEventListener('click', () => ThemeManager.toggle());
}

/** Bootstrap the application */
function init() {
  ThemeManager.init();
  bindEvents();
  UI.renderWelcome();
}

// Run once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}