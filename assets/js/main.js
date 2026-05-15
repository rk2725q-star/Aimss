function initReveal() {
  const items = document.querySelectorAll('.reveal');
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('show'); });
  }, { threshold: 0.16 });
  items.forEach((el) => obs.observe(el));
}

function initCounters() {
  const counters = document.querySelectorAll('[data-count]');
  const animate = (el) => {
    const target = Number(el.dataset.count || 0);
    const suffix = el.dataset.suffix || '';
    const step = Math.max(1, Math.ceil(target / 70));
    let n = 0;
    const t = setInterval(() => {
      n += step;
      if (n >= target) { n = target; clearInterval(t); }
      el.textContent = `${n}${suffix}`;
    }, 20);
  };

  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting && !e.target.dataset.started) {
        e.target.dataset.started = '1';
        animate(e.target);
      }
    });
  }, { threshold: 0.4 });

  counters.forEach((c) => obs.observe(c));
}

function initThemeToggle() {
  const key = 'da-theme';
  const body = document.body;
  const btns = document.querySelectorAll('[data-theme-toggle]');

  const applyTheme = (mode) => {
    if (mode === 'dark') body.classList.add('dark'); else body.classList.remove('dark');
    btns.forEach((btn) => {
      btn.textContent = body.classList.contains('dark') ? 'Light Mode' : 'Dark Mode';
    });
  };

  const saved = localStorage.getItem(key);
  if (saved === 'light' || saved === 'dark') {
    applyTheme(saved);
  } else {
    applyTheme('light');
  }

  btns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const next = body.classList.contains('dark') ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem(key, next);
    });
  });
}

/* ── Shared AI API Helper with multi-proxy fallback ── */
const AI_API_KEY = "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";
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';
const PROXY_URLS = [
  NVIDIA_URL,
  'https://api.allorigins.win/raw?url=' + encodeURIComponent(NVIDIA_URL),
  'https://corsproxy.io/?' + encodeURIComponent(NVIDIA_URL),
  'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(NVIDIA_URL),
];

/* ── Strip Markdown formatting for clean plain-text output ── */
function cleanAIText(text) {
  if (!text) return text;
  return text
    .replace(/\*{3}(.+?)\*{3}/gs, '$1')
    .replace(/\*{2}(.+?)\*{2}/gs, '$1')
    .replace(/\*(.+?)\*/gs, '$1')
    .replace(/_{2}(.+?)_{2}/gs, '$1')
    .replace(/_(.+?)_/gs, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/`{3}[\s\S]*?`{3}/g, '')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, (m) => m.trim())
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .replace(/!\[.*?\]\(.+?\)/g, '')
    .replace(/>{1,}\s*/gm, '')
    .replace(/---+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ══ MULTI-PROVIDER AI ══ */
let ACTIVE_AI_PROVIDER = localStorage.getItem('aimss-ai-provider') || 'nvidia';

const AI_PROVIDERS = {
  nvidia: {
    label: 'NVIDIA', icon: '⚡',
    call: async (messages, maxTokens) => {
      const body = JSON.stringify({ model: 'meta/llama-3.1-8b-instruct', messages, max_tokens: maxTokens });
      const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_API_KEY}` };
      const urls = [NVIDIA_URL, 'https://corsproxy.io/?' + encodeURIComponent(NVIDIA_URL)];
      for (const url of urls) {
        try {
          const ctrl = new AbortController();
          const tid = setTimeout(() => ctrl.abort(), 12000);
          const res = await fetch(url, { method: 'POST', headers, body, signal: ctrl.signal });
          clearTimeout(tid);
          if (!res.ok) continue;
          const d = await res.json();
          const c = d.choices?.[0]?.message?.content;
          if (c) return c;
        } catch (_) { continue; }
      }
      return null;
    }
  },
  pollinations: {
    label: 'Image AI', icon: '🖼️',
    call: async (messages, maxTokens) => {
      try {
        /* Anonymous GET request — unaffected by legacy API deprecation */
        const sysMsg = messages.find(m => m.role === 'system')?.content || '';
        const userMsg = messages.filter(m => m.role === 'user').pop()?.content || '';
        const combined = sysMsg ? `${sysMsg}\n\nUser: ${userMsg}` : userMsg;
        const ctrl = new AbortController();
        const tid = setTimeout(() => ctrl.abort(), 18000);
        /* Migrated to new endpoint (enter.pollinations.ai) — no auth headers sent */
        const url = `https://enter.pollinations.ai/${encodeURIComponent(combined)}?model=openai&seed=${Date.now()}`;
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(tid);
        if (!res.ok) return null;
        let txt = await res.text();
        /* Strip any injected deprecation / system notices from response */
        txt = txt.replace(/⚠+\s*IMPORTANT NOTICE[\s\S]*?work normally\.?/gi, '').trim();
        txt = txt.replace(/The Pollinations legacy text API[\s\S]*?work normally\.?/gi, '').trim();
        return txt || null;
      } catch (_) { return null; }
    }
  }
};

async function callAIWithFallback(messages, maxTokens = 320) {
  const order = ACTIVE_AI_PROVIDER === 'nvidia' ? ['nvidia','pollinations'] : ['pollinations','nvidia'];
  for (const key of order) {
    try {
      const text = await AI_PROVIDERS[key].call(messages, maxTokens);
      if (text) return { text, usedProvider: key };
    } catch (_) { continue; }
  }
  return null;
}

async function callNvidiaAI(messages, maxTokens = 280) {
  const r = await callAIWithFallback(messages, maxTokens);
  return r ? r.text : null;
}

/* ══ IMAGE GEN — Flux ══ */
let IMAGE_MODE = false;

function isImageRequest(msg) {
  return IMAGE_MODE
    || /\b(draw|paint|sketch|generate|create|make|render|design|show)\b.{0,30}\b(flower|rose|heart|diagram|cell|atom|planet|animal|tree|face|scene|landscape|portrait|logo|art|illustration|picture|image|photo)/i.test(msg)
    || /\b(image of|picture of|photo of|draw me|draw a|draw an|generate image|create image|make image|show image|generate a|create a picture)\b/i.test(msg);
}

function extractImagePrompt(msg) {
  /* Keep the subject — strip only leading command words */
  return msg
    .replace(/^(please\s+)?(can you\s+)?(could you\s+)?/i, '')
    .replace(/^(generate|create|draw|make|render|design|paint|sketch|show me|give me)\s+(me\s+)?/i, '')
    .replace(/\b(an image of|a picture of|a photo of|an illustration of|a drawing of|a diagram of)\b/gi, '')
    .trim() || msg.trim();
}

/* ══ CHIPS ══ */
const CHAT_CHIPS = [
  { label: '📖 eBook', msg: 'Help me create a study eBook outline for NEET biology' },
  { label: '🧬 Biology', msg: 'Explain cell division for Class 12 NEET' },
  { label: '⚗️ Chemistry', msg: 'Key organic chemistry reactions for NEET' },
  { label: '⚡ Physics', msg: 'Important physics formulas for Class 12 boards' },
  { label: '📐 Maths', msg: 'Solve a calculus problem step by step' },
  { label: '🗓️ Study Plan', msg: 'Create a 30-day NEET revision plan' },
  { label: '🎨 Draw', msg: 'Generate an image of a human heart diagram' },
  { label: '📊 MCQ Tips', msg: 'Give me 5 tips to improve MCQ accuracy in NEET' },
];

function initFloatingChat() {
  const toggle = document.getElementById('chatToggle');
  const panel  = document.getElementById('chatPanel');
  if (!toggle || !panel) return;

  /* ── Inject fully redesigned panel HTML ── */
  const logoSrc = document.querySelector('.brand-logo')?.src || 'assets/images/ai-bot.png';
  panel.innerHTML = `
    <div class="cp-header">
      <div class="cp-avatar-wrap">
        <img src="assets/images/ai-bot.png" class="cp-avatar" alt="AI"/>
        <span class="cp-dot"></span>
      </div>
      <div class="cp-title-group">
        <strong>Dr.AIMSS AI</strong>
        <span>NVIDIA · Image AI · Flux</span>
      </div>
      <button id="chatClose" class="cp-close" aria-label="Close">✕</button>
    </div>

    <div class="cp-provider-bar">
      <span class="cp-prov-label">Model:</span>
      <button class="cp-prov-btn ${ACTIVE_AI_PROVIDER==='nvidia'?'active':''}" data-prov="nvidia">⚡ NVIDIA</button>
      <button class="cp-prov-btn ${ACTIVE_AI_PROVIDER==='pollinations'?'active':''}" data-prov="pollinations">🖼️ Image AI</button>
      <span class="cp-status" id="aiProvStatus">Ready</span>
    </div>

    <div id="chatLog" class="cp-log">
      <div class="msg bot">Hi! I'm Dr.AIMSS AI. Ask me anything about NEET, CBSE, Stateboard, or tap 🎨 to generate images! 🎓</div>
    </div>

    <div class="cp-chips">
      ${CHAT_CHIPS.map(c=>`<button class="cp-chip">${c.label}</button>`).join('')}
    </div>

    <div class="cp-input-row">
      <button id="imgModeBtn" type="button" class="cp-img-mode-btn" title="Image Generation Mode">🎨</button>
      <input id="chatInput" type="text" placeholder="Ask anything or say Draw..."/>
      <button id="chatSend" type="button" class="cp-send-btn" aria-label="Send">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
  `;

  const close   = panel.querySelector('#chatClose');
  const input   = panel.querySelector('#chatInput');
  const sendBtn = panel.querySelector('#chatSend');
  const imgModeBtn = panel.querySelector('#imgModeBtn');
  const log     = panel.querySelector('#chatLog');

  /* ── Image Mode Toggle ── */
  imgModeBtn.addEventListener('click', () => {
    IMAGE_MODE = !IMAGE_MODE;
    imgModeBtn.classList.toggle('active', IMAGE_MODE);
    imgModeBtn.title = IMAGE_MODE ? 'Image Mode ON — click to turn off' : 'Image Generation Mode';
    input.placeholder = IMAGE_MODE ? '🎨 Describe anything to generate...' : 'Ask anything or say Draw...';
    setStatus(IMAGE_MODE ? '🎨 Image Mode ON' : 'Ready');
  });

  /* ── Provider toggle ── */
  panel.querySelectorAll('.cp-prov-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      ACTIVE_AI_PROVIDER = btn.dataset.prov;
      localStorage.setItem('aimss-ai-provider', ACTIVE_AI_PROVIDER);
      panel.querySelectorAll('.cp-prov-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  /* ── Chips ── */
  panel.querySelectorAll('.cp-chip').forEach((btn, i) => {
    btn.addEventListener('click', () => { input.value = CHAT_CHIPS[i].msg; input.focus(); void send(); });
  });

  /* ── Message helpers ── */
  const setStatus = (txt) => { const el = panel.querySelector('#aiProvStatus'); if (el) el.textContent = txt; };

  const addText = (text, cls) => {
    const m = document.createElement('div');
    m.className = `msg ${cls}`;
    m.textContent = text;
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    return m;
  };

  /* ── addImage: fully DOM-based, no inline handlers, 3-URL fallback ── */
  const addImage = (prompt) => {
    const cleanPrompt = extractImagePrompt(prompt);

    const m = document.createElement('div');
    m.className = 'msg bot msg-image';

    const wrap = document.createElement('div');
    wrap.className = 'ai-img-wrap';
    wrap.style.cssText = 'padding:4px 0;';

    const lbl = document.createElement('span');
    lbl.className = 'ai-img-loading';
    lbl.textContent = '🎨 Generating image…';
    lbl.style.cssText = 'display:block;font-size:13px;opacity:.8;margin-bottom:6px;';

    const img = document.createElement('img');
    img.alt = cleanPrompt;
    img.style.cssText = 'display:none;max-width:100%;width:100%;border-radius:12px;margin-top:6px;';

    wrap.appendChild(lbl);
    wrap.appendChild(img);
    m.appendChild(wrap);
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;

    /* Build 3 fallback URLs with different seeds / params */
    const getUrls = () => {
      const base = encodeURIComponent(cleanPrompt + ', vibrant, high quality, detailed');
      const s = Date.now();
      return [
        `https://image.pollinations.ai/prompt/${base}?model=flux&width=512&height=512&nologo=true&seed=${s}`,
        `https://image.pollinations.ai/prompt/${base}?width=512&height=512&seed=${s + 1}`,
        `https://image.pollinations.ai/prompt/${base}?seed=${s + 2}`,
      ];
    };

    const tryLoad = (urls, attempt = 0) => {
      if (attempt >= urls.length) {
        lbl.textContent = '❌ Image failed. Try rephrasing or tap 🎨 and describe again.';
        setStatus('❌ Image failed');
        return;
      }
      lbl.textContent = attempt === 0 ? '🎨 Generating image…' : `🔄 Retrying (${attempt}/${urls.length - 1})…`;
      img.src = '';

      const newImg = new Image();
      newImg.onload = () => {
        img.src = newImg.src;
        img.style.display = 'block';
        lbl.style.display = 'none';
        setStatus('✅ Image ready');
        log.scrollTop = log.scrollHeight;
      };
      newImg.onerror = () => {
        setTimeout(() => tryLoad(urls, attempt + 1), 1800);
      };
      newImg.src = urls[attempt];
    };

    tryLoad(getUrls());
  };

  /* ── Send logic ── */
  const send = async () => {
    const msg = input.value.trim();
    if (!msg) return;
    addText(msg, 'user');
    input.value = '';
    sendBtn.disabled = true;

    if (isImageRequest(msg)) {
      setStatus('🎨 Generating image…');
      addImage(msg);
      sendBtn.disabled = false;
      return;
    }

    const thinking = addText('Thinking…', 'bot thinking-bubble');
    setStatus('⏳ Thinking…');
    try {
      const sys = 'You are Dr.AIMSS Educational Academy AI assistant. Answer clearly for NEET, Stateboard, and CBSE students Class 6-12. Be concise, accurate and motivating. Use plain text — no **, *, # or backticks.';
      const result = await callAIWithFallback([{role:'system',content:sys},{role:'user',content:msg}], 320);
      thinking.remove();
      if (!result) { addText('AI unavailable right now. Try again.', 'bot'); setStatus('❌ Failed'); }
      else { addText(cleanAIText(result.text), 'bot'); setStatus(AI_PROVIDERS[result.usedProvider].icon+' '+AI_PROVIDERS[result.usedProvider].label); }
    } catch(_) {
      thinking.remove();
      addText('Network error. Please retry.', 'bot');
      setStatus('❌ Error');
    } finally { sendBtn.disabled = false; }
  };

  toggle.addEventListener('click', () => panel.classList.toggle('open'));
  close.addEventListener('click',  () => panel.classList.remove('open'));
  sendBtn.addEventListener('click', () => void send());
  input.addEventListener('keydown', e => { if (e.key==='Enter') { e.preventDefault(); void send(); } });
}

function initSidebarChat() {
  const input = document.getElementById('sidebarChatInput');
  const sendBtn = document.getElementById('sidebarChatSend');
  const log = document.getElementById('sidebarChatLog');
  if (!input || !sendBtn || !log) return;

  const add = (text, cls) => {
    const m = document.createElement('div');
    m.className = `msg ${cls}`;
    m.textContent = text;
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
  };

  const send = async () => {
    const msg = input.value.trim();
    if (!msg) return;
    add(msg, 'user');
    input.value = '';
    sendBtn.disabled = true;
    add('Thinking...', 'bot');

    const activeTitle = document.getElementById('activeLectureTitle')?.textContent || "Unknown Video";

    try {
      const systemPrompt = `You are an AI learning assistant helping a student watch a video.
The current video is: ${activeTitle}.
Answer the student's questions clearly, concisely, and specifically regarding this topic.`;

      const answer = await callNvidiaAI([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: msg }
      ], 280);
      const pending = Array.from(log.querySelectorAll('.msg.bot')).pop();
      if (pending && pending.textContent === 'Thinking...') pending.remove();
      if (!answer) add('AI is unavailable right now. Please try again.', 'bot');
      else add(cleanAIText(answer), 'bot');
    } catch (_e) {
      const pending = Array.from(log.querySelectorAll('.msg.bot')).pop();
      if (pending && pending.textContent === 'Thinking...') pending.remove();
      add('Network issue while contacting AI. Please retry.', 'bot');
    } finally {
      sendBtn.disabled = false;
    }
  };

  sendBtn.addEventListener('click', () => { void send(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); void send(); }
  });
}

function initConversationalSearch() {
  const trigger = document.getElementById('triggerSearchModal');
  const modal = document.getElementById('aiSearchModal');
  const input = document.getElementById('aiSearchInput');
  const results = document.getElementById('aiSearchResults');
  
  if (!trigger || !modal || !input || !results) return;

  const toggle = () => {
    modal.classList.toggle('open');
    if (modal.classList.contains('open')) input.focus();
  };

  trigger.addEventListener('click', toggle);
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) toggle();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      if (!modal.classList.contains('open')) toggle();
    }
    if (e.key === 'Escape' && modal.classList.contains('open')) {
      toggle();
    }
  });

  const sendSearch = async () => {
    const query = input.value.trim();
    if (!query) return;
    
    results.innerHTML = `<div class="ai-search-result"><strong>Searching AI Knowledge Base...</strong><br/><span style="color:var(--muted)">Analyzing courses and materials for: "${query}"</span></div>`;
    input.value = '';

    try {
      const systemPrompt = `You are the Conversational AI Search for Dr.AIMSS EDUCATIONAL ACADEMY (an LMS). 
A student is searching for: "${query}".
1. Provide a direct, concise answer.
2. Recommend related study topics or subjects they should check out.
Format as short plain text or bullet points.`;

      const answer = await callNvidiaAI([
        { role: 'user', content: systemPrompt }
      ], 300);
      
      if (!answer) {
        results.innerHTML = `<div class="ai-search-result" style="color:#e53e3e">Search failed. Try again.</div>`;
        return;
      }
      
      const cleaned = cleanAIText(answer);
      const formatted = cleaned.replace(/\n/g, '<br/>');
      results.innerHTML = `
        <div class="ai-search-result">
          <strong style="color:var(--accent);">AI Answer:</strong>
          <div style="margin-top: 10px; line-height: 1.5;">${formatted}</div>
        </div>
      `;
    } catch (_e) {
      results.innerHTML = `<div class="ai-search-result" style="color:#e53e3e">Network error.</div>`;
    }
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); void sendSearch(); }
  });
}

function initCycleCounts() {
  const map = {
    lectures: [120, 132, 144, 156, 168],
    trainers: [24, 28, 32, 36, 40],
    contents: [860, 940, 1020, 1100, 1240]
  };
  const nodes = document.querySelectorAll('[data-cycle]');
  if (!nodes.length) return;
  const idx = { lectures: 0, trainers: 0, contents: 0 };
  setInterval(() => {
    nodes.forEach((node) => {
      const key = node.dataset.cycle;
      if (!map[key]) return;
      idx[key] = (idx[key] + 1) % map[key].length;
      node.textContent = String(map[key][idx[key]]);
    });
  }, 2200);
}

function initVideoProgress() {
  const ytNode = document.getElementById('youtubePlayer');
  const libraryGrid = document.getElementById('lectureLibraryGrid');
  const searchInput = document.getElementById('lectureSearch');
  const emptyState = document.getElementById('lectureEmptyState');
  const activeTitle = document.getElementById('activeLectureTitle');
  let player;

  if (ytNode) {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    let lectures = JSON.parse(localStorage.getItem('lectureVideosList') || '[]');
    if (lectures.length === 0) {
      lectures = [
        { videoId: 'M7lc1UVf-VE', topic: 'Complete NEET Physics Mastery 2026', classLevel: 'Class 12 / NEET' },
        { videoId: 'dQw4w9WgXcQ', topic: 'Organic Chemistry Fundamentals', classLevel: 'Class 11' },
        { videoId: '3JZ_D3ELwOQ', topic: 'Advanced Mathematics & Algebra', classLevel: 'Class 10 / Matric' },
        { videoId: 'VqyzmZ9xS3g', topic: 'Human Anatomy & Physiology', classLevel: 'Class 12 / CBSE' }
      ];
      localStorage.setItem('lectureVideosList', JSON.stringify(lectures));
    }
    
    const defaultVideoId = lectures.length > 0 ? lectures[0].videoId : 'M7lc1UVf-VE';
    if (activeTitle && lectures.length > 0) activeTitle.textContent = `Featured Lecture: ${lectures[0].topic} (${lectures[0].classLevel})`;

    window.onYouTubeIframeAPIReady = () => {
      player = new YT.Player('youtubePlayer', {
        videoId: defaultVideoId,
        events: {
          'onReady': (event) => {
            const p = event.target;
            const fill = document.getElementById('videoProgressFill');
            const label = document.getElementById('videoProgressLabel');
            setInterval(() => {
              if (p.getDuration && p.getDuration() > 0) {
                const pct = (p.getCurrentTime() / p.getDuration()) * 100;
                if (fill) fill.style.width = `${pct.toFixed(1)}%`;
                if (label) label.textContent = `Progress: ${pct.toFixed(1)}%`;
              }
            }, 1000);
          }
        }
      });
    };

    if (libraryGrid) {
      const renderLibrary = (filter = '') => {
        libraryGrid.innerHTML = '';
        let found = 0;
        lectures.forEach(lec => {
          const searchStr = `${lec.topic} ${lec.classLevel}`.toLowerCase();
          if (filter && !searchStr.includes(filter.toLowerCase())) return;

          found++;
          const card = document.createElement('article');
          card.className = 'gfg-card';
          card.innerHTML = `
            <div class="gfg-card-thumb" style="background-image: url('https://img.youtube.com/vi/${lec.videoId}/mqdefault.jpg');">
              <span class="gfg-card-badge">Course</span>
            </div>
            <div class="gfg-card-body">
              <span class="gfg-card-level">${lec.classLevel}</span>
              <h3 class="gfg-card-title">${lec.topic}</h3>
              <div class="gfg-card-stats">
                <span class="gfg-rating">
                  <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                  4.8
                </span>
                <span>• Video</span>
              </div>
            </div>
            <div class="gfg-card-footer">
              <span class="gfg-price">Free</span>
              <span class="gfg-btn">Watch <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg></span>
            </div>
          `;
          card.addEventListener('click', () => {
            if (player && player.loadVideoById) {
              player.loadVideoById(lec.videoId);
              if (activeTitle) activeTitle.textContent = `Featured Lecture: ${lec.topic} (${lec.classLevel})`;
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          });
          libraryGrid.appendChild(card);
        });

        if (emptyState) {
          emptyState.style.display = found === 0 ? 'block' : 'none';
        }
      };

      renderLibrary();

      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          renderLibrary(e.target.value);
        });
      }
    }
  }
}

function initLoginForm() {
  const form = document.getElementById('loginForm');
  const emailInput = document.getElementById('loginEmail');
  const passwordInput = document.getElementById('loginPassword');
  const status = document.getElementById('loginStatus');
  const loginBtn = document.getElementById('loginBtn');
  if (!form || !emailInput || !passwordInput || !status || !loginBtn) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    if (!email || !password) {
      status.textContent = 'Please enter email and password.';
      return;
    }

    loginBtn.disabled = true;
    status.textContent = 'Signing in...';

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        status.textContent = data?.error || 'Login failed.';
        return;
      }
      status.textContent = `Welcome ${data?.user?.email || email}. Login successful.`;
    } catch (_err) {
      status.textContent = 'Network error. Please try again.';
    } finally {
      loginBtn.disabled = false;
    }
  });
}

function initRoleLogin() {
  const form = document.getElementById('roleLoginForm');
  const emailInput = document.getElementById('roleEmail');
  const passwordInput = document.getElementById('rolePassword');
  const roleInput = document.getElementById('roleType');
  const status = document.getElementById('roleLoginStatus');
  if (!form || !emailInput || !passwordInput || !roleInput || !status) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const role = roleInput.value;

    if (!email || !password) {
      status.textContent = 'Please enter email and password.';
      return;
    }

    localStorage.setItem(`auth-${role}`, JSON.stringify({ email, at: Date.now() }));
    localStorage.setItem('portal-auth', role);
    status.textContent = `Login successful for ${role}. Redirecting...`;
    setTimeout(() => {
      window.location.href = role === 'student' ? 'student-dashboard.html' : 'command-center.html';
    }, 500);
  });
}

function initPortalGuard() {
  const protectedPages = new Set([
    '/command-center.html',
    '/student-dashboard.html',
    '/student-login.html',
    '/teacher-login.html',
    '/teacher-progress.html',
    '/ai-pdf-generator.html',
    '/mcq-test.html'
  ]);
  const path = window.location.pathname;
  if (!protectedPages.has(path)) return;
  if (path.endsWith('/student-login.html') || path.endsWith('/teacher-login.html') || path.endsWith('/login.html')) return;

  const role = localStorage.getItem('portal-auth');
  const hasStudent = !!localStorage.getItem('auth-student');
  const hasTeacher = !!localStorage.getItem('auth-teacher');
  if (!role && !hasStudent && !hasTeacher) {
    window.location.href = 'login.html';
  }
}

function getRewardState() {
  return JSON.parse(localStorage.getItem('student-rewards-v1') || '{"points":0,"level":1}');
}

function setRewardState(data) {
  localStorage.setItem('student-rewards-v1', JSON.stringify(data));
}

function awardPoints(points) {
  const state = getRewardState();
  state.points += points;
  state.level = Math.max(1, Math.floor(state.points / 100) + 1);
  setRewardState(state);
}

function initStudentRewards() {
  const pointsEl = document.getElementById('studentPoints');
  const levelEl = document.getElementById('studentLevel');
  const nextEl = document.getElementById('studentNextLevel');
  const mailEl = document.getElementById('studentEmailBadge');
  if (!pointsEl || !levelEl || !nextEl) return;

  const state = getRewardState();
  const next = state.level * 100 - state.points;
  pointsEl.textContent = String(state.points);
  levelEl.textContent = `Level ${state.level}`;
  nextEl.textContent = `${Math.max(next, 0)} pts to next level`;

  if (mailEl) {
    const session = JSON.parse(localStorage.getItem('auth-student') || '{}');
    mailEl.textContent = session.email || 'student@profile';
  }
}

function initTeacherProgress() {
  const form = document.getElementById('progressForm');
  const body = document.getElementById('progressBody');
  const exportBtn = document.getElementById('exportProgressBtn');
  if (!form || !body) return;
  const key = 'student-progress-v1';

  const read = () => JSON.parse(localStorage.getItem(key) || '[]');
  const write = (rows) => localStorage.setItem(key, JSON.stringify(rows));

  const render = () => {
    const rows = read();
    body.innerHTML = '';
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="4">No progress records yet.</td></tr>';
      return;
    }
    rows.forEach((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.name}</td><td>${r.subject}</td><td><span class="badge-score">${r.score}%</span></td><td>${r.note}</td>`;
      body.appendChild(tr);
    });
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const row = {
      name: String(fd.get('name') || '').trim(),
      subject: String(fd.get('subject') || '').trim(),
      score: Number(fd.get('score') || 0),
      note: String(fd.get('note') || '').trim()
    };
    if (!row.name || !row.subject) return;
    const rows = read();
    rows.unshift(row);
    write(rows);
    form.reset();
    render();
  });

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const rows = read();
      const lines = ['Student,Subject,Score,Note'];
      rows.forEach((r) => lines.push(`${r.name},${r.subject},${r.score},${r.note}`));
      const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'student-progress.csv';
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  render();
}

function initAiPdfGenerator() {
  const form = document.getElementById('pdfGenForm');
  const output = document.getElementById('pdfOutput');
  const status = document.getElementById('pdfStatus');
  const printBtn = document.getElementById('printPdfBtn');
  if (!form || !output || !status) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic = document.getElementById('pdfTopic')?.value?.trim() || '';
    const grade = document.getElementById('pdfGrade')?.value?.trim() || '';
    if (!topic) {
      status.textContent = 'Enter a topic first.';
      return;
    }
    status.textContent = 'Generating notes with AI...';
    try {
      const API_KEY = "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";
      const promptText = `Create clean study notes for students.
Topic: ${topic}
Class/Grade: ${grade || "General"}
Format:
1) Overview
2) Core concepts
3) Important formulas/facts
4) 5 quick revision points
5) 3 short practice questions
Keep it concise and exam oriented.`;

      const res = await fetch('https://corsproxy.io/?url=https%3A%2F%2Fintegrate.api.nvidia.com%2Fv1%2Fchat%2Fcompletions', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`
        },
        body: JSON.stringify({ 
          model: 'meta/llama-3.1-8b-instruct',
          messages: [
            { role: 'user', content: promptText }
          ],
          max_tokens: 900
        })
      });
      const data = await res.json();
      if (!res.ok) {
        status.textContent = data?.error || 'Generation failed.';
        return;
      }
      output.value = data.choices?.[0]?.message?.content || '';
      status.textContent = 'Generated. Click Print/Save as PDF.';
      awardPoints(20);
      initStudentRewards();
    } catch (_e) {
      status.textContent = 'Network error while generating.';
    }
  });

  if (printBtn) {
    printBtn.addEventListener('click', () => {
      const text = output.value.trim();
      if (!text) return;
      const w = window.open('', '_blank');
      if (!w) return;
      w.document.write(`<pre style="white-space:pre-wrap;font:16px/1.5 Manrope,sans-serif;padding:24px;">${text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`);
      w.document.close();
      w.focus();
      w.print();
    });
  }
}

function initMcqTest() {
  const box = document.getElementById('mcqBox');
  const nextBtn = document.getElementById('mcqNext');
  const scoreEl = document.getElementById('mcqScore');
  if (!box || !nextBtn || !scoreEl) return;

  const defaultQuestions = [
    { q: 'What is the SI unit of force?', a: ['Newton', 'Joule', 'Watt', 'Pascal'], c: 0 },
    { q: 'DNA full form is?', a: ['Deoxyribo Nucleic Acid', 'Dynamic Nuclear Acid', 'Double Nitrogen Atom', 'None'], c: 0 },
    { q: '2 + 3 x 4 = ?', a: ['20', '14', '24', '11'], c: 1 },
    { q: 'Plant food preparation process?', a: ['Respiration', 'Photosynthesis', 'Transpiration', 'Digestion'], c: 1 }
  ];
  const custom = JSON.parse(localStorage.getItem('custom-mcqs-v1') || '[]');
  const questions = [...defaultQuestions, ...custom];
  let idx = 0;
  let score = 0;
  let locked = false;

  const render = () => {
    locked = false;
    const cur = questions[idx];
    box.innerHTML = `<h3>Q${idx + 1}. ${cur.q}</h3>`;
    cur.a.forEach((opt, i) => {
      const b = document.createElement('button');
      b.className = 'mcq-option';
      b.type = 'button';
      b.textContent = opt;
      b.addEventListener('click', () => {
        if (locked) return;
        locked = true;
        if (i === cur.c) {
          b.classList.add('correct');
          score += 1;
        } else {
          b.classList.add('wrong');
        }
        scoreEl.textContent = `Score: ${score}/${questions.length}`;
      });
      box.appendChild(b);
    });
  };

  nextBtn.addEventListener('click', () => {
    idx += 1;
    if (idx >= questions.length) {
      localStorage.setItem('latest-mcq-score', String(Math.round((score / questions.length) * 100)));
      awardPoints(score * 5);
      initStudentRewards();
      box.innerHTML = `<h3>Test Complete</h3><p>Your score is ${score}/${questions.length}.</p>`;
      nextBtn.disabled = true;
      return;
    }
    render();
  });

  render();
}

function initTeacherMcq() {
  const form = document.getElementById('mcqCreatorForm');
  const status = document.getElementById('mcqCreatorStatus');
  if (!form || !status) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = document.getElementById('mcqQuestion').value.trim();
    const a = [
      document.getElementById('mcqOpt0').value.trim(),
      document.getElementById('mcqOpt1').value.trim(),
      document.getElementById('mcqOpt2').value.trim(),
      document.getElementById('mcqOpt3').value.trim()
    ];
    const c = Number(document.getElementById('mcqCorrect').value);
    
    if (!q || a.some(opt => !opt)) return;

    const existing = JSON.parse(localStorage.getItem('custom-mcqs-v1') || '[]');
    existing.push({ q, a, c });
    localStorage.setItem('custom-mcqs-v1', JSON.stringify(existing));
    
    status.textContent = 'Question added successfully!';
    form.reset();
    setTimeout(() => { status.textContent = ''; }, 3000);
  });
}

function initSidebarMobile() {
  const sidebar = document.getElementById('portalSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  const closeBtn = document.getElementById('sidebarCloseBtn');
  const topNav = document.querySelector('.nav-tools');
  
  if (!sidebar || !overlay) return;

  // Dynamically add hamburger menu to topbar
  if (topNav) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-soft';
    btn.style.cssText = 'padding: 8px; border: none; display: flex; align-items: center; justify-content: center;';
    btn.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" stroke-width="2" fill="none"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>';
    
    // Only show on mobile
    btn.classList.add('mobile-only-btn');
    topNav.insertBefore(btn, topNav.firstChild);

    const toggle = () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('open');
    };

    btn.addEventListener('click', toggle);
    if (closeBtn) {
      closeBtn.style.display = 'block';
      closeBtn.addEventListener('click', toggle);
    }
    overlay.addEventListener('click', toggle);
  }
}

function initTeacherVideo() {
  const form = document.getElementById('lectureVideoForm');
  const status = document.getElementById('lectureVideoStatus');
  if (!form || !status) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('ytVideoInput').value.trim();
    const vidClass = document.getElementById('vidClass').value;
    const vidTopic = document.getElementById('vidTopic').value.trim();
    if (!input || !vidClass || !vidTopic) return;

    let videoId = input;
    if (input.includes('youtube.com') || input.includes('youtu.be')) {
      try {
        const url = new URL(input);
        if (input.includes('youtu.be')) {
          videoId = url.pathname.slice(1);
        } else {
          videoId = url.searchParams.get('v');
        }
      } catch (err) {
        status.textContent = "Invalid URL format.";
        return;
      }
    }

    if (videoId) {
      const newLecture = {
        id: Date.now().toString(),
        classLevel: vidClass,
        topic: vidTopic,
        videoId: videoId,
        addedAt: new Date().toISOString()
      };
      const list = JSON.parse(localStorage.getItem('lectureVideosList') || '[]');
      list.push(newLecture);
      localStorage.setItem('lectureVideosList', JSON.stringify(list));
      
      status.textContent = 'Lecture added to library successfully!';
      status.style.color = '#38a169';
      setTimeout(() => status.textContent = '', 3000);
      form.reset();
    } else {
      status.textContent = "Could not extract Video ID.";
      status.style.color = '#e53e3e';
    }
  });
}

initThemeToggle();
initPortalGuard();
initReveal();
initCounters();
initFloatingChat();
initSidebarChat();
initConversationalSearch();
initVideoProgress();
initCycleCounts();
initLoginForm();
initRoleLogin();
initTeacherProgress();
initTeacherMcq();
initAiPdfGenerator();
initMcqTest();
initStudentRewards();
initSidebarMobile();
initTeacherVideo();


