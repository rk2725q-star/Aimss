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

/* ══════════════════════════════════════════════════════════════
   AI ENGINE — delegated to ai-resilience.js
   The following are defined there and available globally:
     - ACTIVE_AI_PROVIDER  (let, synced via setActiveProvider())
     - AI_PROVIDERS        (label/icon map)
     - callAIWithFallback(messages, maxTokens)  ← protected entry
     - callNvidiaAI(messages, maxTokens)        ← simple wrapper
     - CIRCUIT_BREAKERS, HealthMonitor, AIQueue (for UI)
     - bindHealthDots(panelEl)                  ← wires live dots
   ══════════════════════════════════════════════════════════════ */

/** Sync provider preference into the resilience module */
function setActiveProvider(prov) {
  ACTIVE_AI_PROVIDER = prov;   // defined in ai-resilience.js
  localStorage.setItem('aimss-ai-provider', prov);
}

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
    .replace(/~~(.+?)~~/gs, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ══ CHAT MODE SYSTEM ══ */
const CHAT_MODES = {
  general: {
    key: 'general', label: 'General', icon: '🎓', color: '#a78bfa',
    placeholder: 'Ask anything about NEET, CBSE, Matric…',
    maxTokens: 400,
    welcome: 'Hi! I’m Dr.AIMSS AI. Click a mode chip below or ask me anything! 🎓',
    systemPrompt: 'You are Dr.AIMSS Educational Academy AI assistant. Answer clearly and concisely for NEET, Stateboard, and CBSE students Class 6-12. Be accurate and motivating. Use plain text only — no **, *, # or backticks.'
  },
  ebook: {
    key: 'ebook', label: 'eBook', icon: '📖', color: '#f59e0b',
    placeholder: 'Describe the eBook you want to generate…',
    maxTokens: 4096,
    welcome: '📖 eBook Mode active! Tell me what eBook to generate (e.g. “NEET Biology Chapter: Cell Division” or “Rich Dad Poor Dad style book on study habits”). I’ll write a full 25–45 page PDF for you!',
    systemPrompt: 'You are an expert educational eBook author writing for NEET, CBSE, and Stateboard students. Write detailed, accurate, well-structured educational content. Use plain text only — no markdown symbols (no **, *, #, backticks). Use CAPS for headings. Write in flowing paragraphs.'
  },
  biology: {
    key: 'biology', label: 'Biology', icon: '🧬', color: '#10b981',
    placeholder: 'Ask any Biology question (NEET, CBSE, Class 11-12)…',
    maxTokens: 500,
    welcome: '🧬 Biology Mode! Ask me anything about Cell Biology, Genetics, Ecology, Human Physiology, Plant Biology and more!',
    systemPrompt: 'You are Dr.AIMSS Biology expert teacher specializing in NEET, CBSE Class 11-12. Give clear, accurate, exam-focused answers. Include key points and important terms. Use plain text only — no **, *, # or backticks.'
  },
  chemistry: {
    key: 'chemistry', label: 'Chemistry', icon: '⚗️', color: '#06b6d4',
    placeholder: 'Ask any Chemistry question (NEET, CBSE)…',
    maxTokens: 500,
    welcome: '⚗️ Chemistry Mode! Ask about Organic, Inorganic, Physical Chemistry, reactions, equations and more!',
    systemPrompt: 'You are Dr.AIMSS Chemistry expert for NEET, CBSE students. Explain reactions, mechanisms, and concepts clearly. Always include formulae written in plain text. Use plain text only — no **, *, # or backticks.'
  },
  physics: {
    key: 'physics', label: 'Physics', icon: '⚡', color: '#f97316',
    placeholder: 'Ask any Physics question (NEET, CBSE, Class 12)…',
    maxTokens: 500,
    welcome: '⚡ Physics Mode! Ask about Mechanics, Electricity, Optics, Modern Physics, Thermodynamics and more!',
    systemPrompt: 'You are Dr.AIMSS Physics expert for NEET, CBSE Class 11-12. Explain concepts with clarity, include relevant formulae in plain text. Be exam-focused and accurate. Use plain text only — no **, *, # or backticks.'
  },
  maths: {
    key: 'maths', label: 'Maths', icon: '📐', color: '#8b5cf6',
    placeholder: 'Ask any Maths problem or concept…',
    maxTokens: 500,
    welcome: '📐 Maths Mode! Ask me to solve problems, explain concepts or derive formulae for Class 6-12, CBSE, Stateboard!',
    systemPrompt: 'You are Dr.AIMSS Mathematics expert for CBSE, Stateboard Class 6-12. Solve problems step by step clearly. Write equations and formulae in plain text notation. Be precise and show working. Use plain text only — no **, *, # or backticks.'
  },
  studyplan: {
    key: 'studyplan', label: 'Study Plan', icon: '🗓️', color: '#ec4899',
    placeholder: 'Tell me your exam, goal and days available…',
    maxTokens: 600,
    welcome: '🗓️ Study Plan Mode! Tell me your exam (NEET, CBSE, Stateboard), available days, and weak subjects. I’ll create a personalised revision schedule!',
    systemPrompt: 'You are Dr.AIMSS study planning expert. Create detailed, practical, day-by-day or week-by-week study schedules for NEET, CBSE, Stateboard students. Be specific with topics and time allocation. Use plain text only — no **, *, # or backticks.'
  },
  mcq: {
    key: 'mcq', label: 'MCQ', icon: '📊', color: '#ef4444',
    placeholder: 'Which subject/topic MCQs should I generate? (e.g. NEET Biology – Cell Division, 50 questions)…',
    maxTokens: 4000,
    welcome: '📊 MCQ Mode! Tell me the subject, topic and how many questions (40–75 recommended). I\'ll generate a full question bank with options A, B, C, D and the correct answer for each!',
    systemPrompt: 'You are Dr.AIMSS MCQ test expert for NEET, CBSE, and Stateboard students. The user will specify a subject, topic and number of questions (typically 40–75). Generate ALL the requested questions — do NOT stop early. Format each question exactly as:\nQ1. [Question]\nA) option B) option C) option D) option\nAnswer: [Letter]\n\nContinue numbering Q2, Q3 … up to the full requested count. Make every question exam-standard quality and cover the topic broadly. Use plain text only — no **, *, # or backticks.'
  }
};

const CHIP_MODE_KEYS = ['ebook','biology','chemistry','physics','maths','studyplan','mcq'];
let ACTIVE_CHAT_MODE = 'general';


function initFloatingChat() {
  const toggle = document.getElementById('chatToggle');
  const panel  = document.getElementById('chatPanel');
  if (!toggle || !panel) return;

  /* ── Build chip HTML ── */
  const chipHTML = CHIP_MODE_KEYS.map(key => {
    const m = CHAT_MODES[key];
    return `<button class="cp-chip cp-mode-chip" data-mode="${key}" style="--mode-color:${m.color}">${m.icon} ${m.label}</button>`;
  }).join('');

  /* ── Inject panel HTML ── */
  const isGeminiPro = ACTIVE_AI_PROVIDER === 'geminipro';
  panel.innerHTML = `
    <div class="cp-header">
      <div class="cp-avatar-wrap">
        <img src="assets/images/ai-bot.png" class="cp-avatar" alt="AI"/>
        <span class="cp-dot"></span>
      </div>
      <div class="cp-title-group">
        <strong>Dr.AIMSS AI</strong>
        <span id="cpActiveModelLabel">${isGeminiPro ? '🧠 Gemini Pro' : '⚡ NVIDIA'} &mdash; Active</span>
      </div>
      <button id="chatClose" class="cp-close" aria-label="Close">✕</button>
    </div>

    <div class="cp-mode-indicator" id="cpModeIndicator" style="--mode-color:${CHAT_MODES[ACTIVE_CHAT_MODE].color}">
      <span class="cp-mode-icon">${CHAT_MODES[ACTIVE_CHAT_MODE].icon}</span>
      <span class="cp-mode-label">${CHAT_MODES[ACTIVE_CHAT_MODE].label} Mode</span>
      <button class="cp-mode-reset" id="cpModeReset" title="Back to General">Reset</button>
    </div>

    <div class="cp-model-switcher-bar">
      <span class="cp-model-switcher-title">AI Model</span>
      <div class="cp-model-toggle ${isGeminiPro ? 'geminipro' : 'nvidia'}" id="cpModelToggle" role="group" aria-label="Select AI model">
        <div class="cp-model-toggle-track">
          <div class="cp-model-toggle-pill"></div>
          <button class="cp-model-opt ${!isGeminiPro ? 'active' : ''}" data-prov="nvidia" aria-pressed="${!isGeminiPro}">
            <span class="cp-health-dot health-healthy" data-prov="nvidia"></span>
            <span class="cp-model-opt-icon">⚡</span>
            <span class="cp-model-opt-name">NVIDIA</span>
          </button>
          <button class="cp-model-opt ${isGeminiPro ? 'active' : ''}" data-prov="geminipro" aria-pressed="${isGeminiPro}">
            <span class="cp-health-dot health-healthy" data-prov="geminipro"></span>
            <span class="cp-model-opt-icon">🧠</span>
            <span class="cp-model-opt-name">Gemini Pro</span>
          </button>
        </div>
      </div>
      <span id="cpQueueBadge" class="cp-queue-badge" style="display:none"></span>
      <span class="cp-status" id="aiProvStatus">Ready</span>
    </div>

    <div id="chatLog" class="cp-log">
      <div class="msg bot">${CHAT_MODES.general.welcome}</div>
    </div>

    <div class="cp-chips">${chipHTML}</div>

    <div class="cp-input-row">
      <input id="chatInput" type="text" placeholder="${CHAT_MODES[ACTIVE_CHAT_MODE].placeholder}"/>
      <button id="chatSend" type="button" class="cp-send-btn" aria-label="Send">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
  `;

  const close      = panel.querySelector('#chatClose');
  const input      = panel.querySelector('#chatInput');
  const sendBtn    = panel.querySelector('#chatSend');
  const log        = panel.querySelector('#chatLog');
  const modeBar    = panel.querySelector('#cpModeIndicator');
  const modelToggle = panel.querySelector('#cpModelToggle');
  const modelLabel  = panel.querySelector('#cpActiveModelLabel');

  /* ── Mode Switcher ── */
  const applyMode = (modeKey) => {
    ACTIVE_CHAT_MODE = modeKey;
    const m = CHAT_MODES[modeKey];
    // Update mode indicator bar
    modeBar.style.setProperty('--mode-color', m.color);
    modeBar.querySelector('.cp-mode-icon').textContent  = m.icon;
    modeBar.querySelector('.cp-mode-label').textContent = m.label + ' Mode';
    modeBar.classList.toggle('cp-mode-general', modeKey === 'general');
    // Update input placeholder
    input.placeholder = m.placeholder;
    // Highlight active chip
    panel.querySelectorAll('.cp-mode-chip').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === modeKey);
    });
    // Add mode welcome message to chat
    const welcome = document.createElement('div');
    welcome.className = 'msg bot cp-mode-welcome';
    welcome.style.setProperty('--mode-color', m.color);
    welcome.textContent = m.welcome;
    log.appendChild(welcome);
    log.scrollTop = log.scrollHeight;
    input.focus();
  };

  panel.querySelectorAll('.cp-mode-chip').forEach(btn => {
    btn.addEventListener('click', () => applyMode(btn.dataset.mode));
  });
  panel.querySelector('#cpModeReset')?.addEventListener('click', () => applyMode('general'));

  /* ── Model toggle switcher ── */
  const applyProvider = (prov, animate = true) => {
    setActiveProvider(prov);
    modelToggle.className = `cp-model-toggle ${prov}${animate ? ' switching' : ''}`;
    if (animate) setTimeout(() => modelToggle.classList.remove('switching'), 400);
    panel.querySelectorAll('.cp-model-opt').forEach(b => {
      const active = b.dataset.prov === prov;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', active);
    });
    const info = AI_PROVIDERS[prov];
    if (modelLabel) modelLabel.innerHTML = `${info.icon} ${info.label} &mdash; Active`;
  };
  panel.querySelectorAll('.cp-model-opt').forEach(btn => {
    btn.addEventListener('click', () => applyProvider(btn.dataset.prov));
  });
  if (typeof bindHealthDots === 'function') bindHealthDots(panel);

  /* ── Helpers ── */
  const setStatus = (txt) => { const el = panel.querySelector('#aiProvStatus'); if (el) el.textContent = txt; };
  const addText = (text, cls) => {
    const m = document.createElement('div');
    m.className = `msg ${cls}`;
    m.textContent = text;
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    return m;
  };

  /* ═══════════════════════════════════════════════════
     eBOOK PDF GENERATOR
  ═══════════════════════════════════════════════════ */

  /** Progress bubble shown in chat during eBook generation */
  let ebookProgressBubble = null;
  const setEbookProgress = (text, pct) => {
    if (!ebookProgressBubble) {
      ebookProgressBubble = document.createElement('div');
      ebookProgressBubble.className = 'msg bot cp-ebook-progress-bubble';
      log.appendChild(ebookProgressBubble);
    }
    ebookProgressBubble.innerHTML = `
      <div class="cp-ebook-prog-label">${text}</div>
      <div class="cp-ebook-prog-bar"><div class="cp-ebook-prog-fill" style="width:${pct}%"></div></div>
      <div class="cp-ebook-prog-pct">${Math.round(pct)}%</div>
    `;
    log.scrollTop = log.scrollHeight;
  };

  /** Build the PDF using jsPDF */
  function buildEbookPDF(outline, chapters) {
    if (!window.jspdf) throw new Error('jsPDF not loaded');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const PW = 210, PH = 297;
    const BM = 10;   // border margin
    const TM = 22;   // text top margin
    const LM = 22;   // text left margin
    const RM = 22;   // text right margin
    const CW = PW - LM - RM; // content width
    let pageNum = 0;

    const addBorder = () => {
      doc.setDrawColor(100, 60, 200);
      doc.setLineWidth(1.0);
      doc.rect(BM, BM, PW - BM*2, PH - BM*2);
      doc.setLineWidth(0.3);
      doc.setDrawColor(150, 110, 230);
      doc.rect(BM+2.5, BM+2.5, PW - (BM+2.5)*2, PH - (BM+2.5)*2);
    };

    const addFooter = (n) => {
      doc.setFontSize(8);
      doc.setFont('helvetica','normal');
      doc.setTextColor(150, 100, 200);
      doc.text('Generated by Dr. AIMSS AI  |  Dr.AIMSS Educational Academy', PW/2, PH - BM - 4, {align:'center'});
      doc.text(String(n), PW/2, PH - BM - 8, {align:'center'});
    };

    // ── COVER PAGE ──
    addBorder();
    // Header strip
    doc.setFillColor(60, 20, 130);
    doc.rect(BM, BM, PW - BM*2, 38, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica','bold');
    doc.text('Dr. AIMSS Educational Academy', PW/2, BM+16, {align:'center'});
    doc.setFontSize(9);
    doc.setFont('helvetica','normal');
    doc.text('Excellence in Education • NEET • CBSE • Stateboard', PW/2, BM+26, {align:'center'});

    // Title
    doc.setTextColor(40, 10, 90);
    doc.setFontSize(26);
    doc.setFont('helvetica','bold');
    const titleLines = doc.splitTextToSize(outline.title || 'Educational eBook', CW - 10);
    doc.text(titleLines, PW/2, 110, {align:'center'});

    if (outline.subtitle) {
      doc.setFontSize(13);
      doc.setFont('helvetica','italic');
      doc.setTextColor(90, 50, 160);
      const subLines = doc.splitTextToSize(outline.subtitle, CW - 20);
      doc.text(subLines, PW/2, 118 + titleLines.length * 10, {align:'center'});
    }

    // Decorative divider
    doc.setDrawColor(139, 92, 246);
    doc.setLineWidth(1.2);
    doc.line(LM + 15, 160, PW - RM - 15, 160);
    doc.setLineWidth(0.4);
    doc.line(LM + 25, 163, PW - RM - 25, 163);

    // Chapter count
    doc.setTextColor(100, 60, 180);
    doc.setFontSize(11);
    doc.setFont('helvetica','normal');
    doc.text(`${chapters.length} Chapters  •  Comprehensive Study Material`, PW/2, 175, {align:'center'});

    // Date
    doc.setFontSize(9);
    doc.setTextColor(130, 90, 190);
    doc.text(new Date().toLocaleDateString('en-IN',{year:'numeric',month:'long',day:'numeric'}), PW/2, 185, {align:'center'});

    addFooter('Cover');
    pageNum++;

    // ── TABLE OF CONTENTS ──
    doc.addPage();
    pageNum++;
    addBorder();
    doc.setFillColor(240, 232, 255);
    doc.rect(BM, BM, PW - BM*2, 18, 'F');
    doc.setTextColor(60, 20, 130);
    doc.setFontSize(14);
    doc.setFont('helvetica','bold');
    doc.text('TABLE OF CONTENTS', PW/2, BM+12, {align:'center'});

    doc.setFontSize(10);
    doc.setFont('helvetica','normal');
    let tocY = TM + 18;
    chapters.forEach((ch, idx) => {
      doc.setTextColor(60, 30, 120);
      doc.setFont('helvetica','bold');
      doc.text(`${idx+1}.`, LM, tocY);
      doc.setFont('helvetica','normal');
      doc.setTextColor(40, 10, 80);
      const chLine = doc.splitTextToSize(ch.title, CW - 20);
      doc.text(chLine, LM + 10, tocY);
      // Dots
      doc.setTextColor(160, 130, 200);
      doc.text(`${idx + 3}`, PW - RM - 2, tocY, {align:'right'});
      tocY += chLine.length * 6 + 4;
      if (tocY > PH - TM - 20) {
        doc.addPage(); pageNum++;
        addBorder();
        tocY = TM;
      }
    });
    addFooter(pageNum);

    // ── CHAPTER PAGES ──
    chapters.forEach((ch, idx) => {
      doc.addPage();
      pageNum++;
      addBorder();

      // Chapter header strip
      doc.setFillColor(80, 30, 160);
      doc.rect(BM, BM, PW - BM*2, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont('helvetica','normal');
      doc.text(`CHAPTER ${idx + 1}`, LM, BM+9);
      doc.setFontSize(12);
      doc.setFont('helvetica','bold');
      const chTitleLines = doc.splitTextToSize(ch.title.toUpperCase(), CW - 4);
      doc.text(chTitleLines, LM, BM+17);

      let y = BM + 30;
      const content = ch.content || '';
      const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 0);

      doc.setFontSize(10.5);
      doc.setFont('helvetica','normal');
      doc.setTextColor(30, 10, 60);

      for (const para of paragraphs) {
        const trimmed = para.trim();
        // Detect ALL-CAPS heading
        const isHeading = trimmed === trimmed.toUpperCase() && trimmed.length < 80 && trimmed.length > 2;
        if (isHeading) {
          y += 3;
          doc.setFont('helvetica','bold');
          doc.setFontSize(11);
          doc.setTextColor(70, 20, 150);
          const hl = doc.splitTextToSize(trimmed, CW);
          if (y + hl.length * 6 > PH - BM - 18) {
            addFooter(pageNum);
            doc.addPage(); pageNum++;
            addBorder();
            y = TM;
          }
          doc.text(hl, LM, y);
          // Draw underline IMMEDIATELY below heading baseline (before advancing y)
          // Bug fix: drawing at y-1 AFTER y advances caused it to fall inside the next text line
          doc.setDrawColor(139, 92, 246);
          doc.setLineWidth(0.4);
          doc.line(LM, y + 1.5, LM + CW * 0.6, y + 1.5);
          doc.setFont('helvetica','normal');
          doc.setFontSize(10.5);
          doc.setTextColor(30, 10, 60);
          y += hl.length * 6 + 8; // proper gap: heading height + space below underline
        } else {
          const lines = doc.splitTextToSize(trimmed, CW);
          for (const line of lines) {
            if (y > PH - BM - 18) {
              addFooter(pageNum);
              doc.addPage(); pageNum++;
              addBorder();
              y = TM;
            }
            doc.text(line, LM, y);
            y += 5.5;
          }
          y += 3; // paragraph spacing
        }
      }
      addFooter(pageNum);
    });

    return doc;
  }

  // ── Expose globally so ai-pdf-generator.html can use it ──
  window.buildEbookPDF = buildEbookPDF;

  /** Main eBook generation flow */
  async function generateEbook(topic) {
    sendBtn.disabled = true;
    ebookProgressBubble = null;
    setEbookProgress('💻 Planning your eBook structure…', 3);
    setStatus('📖 Generating…');

    // Step 1: Outline
    const outlinePrompt = `You are an expert educational eBook author for NEET/CBSE students.
Create a detailed eBook outline for: "${topic}"
Respond with ONLY a valid JSON object — no extra text before or after:
{
  "title": "Full Book Title Here",
  "subtitle": "A descriptive subtitle",
  "chapters": [
    {"number": 1, "title": "Chapter Title", "description": "Brief description of what this chapter covers"},
    ... (8 to 12 chapters total)
  ]
}`;

    let outline = { title: topic, subtitle: 'A Comprehensive Guide', chapters: [] };
    try {
      const r = await callAIWithFallback([{role:'user',content:outlinePrompt}], 1500);
      if (r) {
        const jsonMatch = r.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) outline = JSON.parse(jsonMatch[0]);
      }
    } catch(_) {}

    // Fallback: create generic chapters if parse failed
    if (!outline.chapters || outline.chapters.length === 0) {
      outline.title    = topic;
      outline.subtitle = 'A Comprehensive Educational Guide';
      outline.chapters = [
        'Introduction','Core Concepts','Key Principles','Detailed Analysis',
        'Practical Applications','Important Examples','Common Questions',
        'Advanced Topics','Exam Tips & Tricks','Summary & Revision'
      ].map((t,i) => ({number:i+1, title:t, description:''}));
    }

    setEbookProgress(`📚 Outline ready — ${outline.chapters.length} chapters planned`, 8);

    // Step 2: Generate each chapter
    const chapters = [];
    for (let i = 0; i < outline.chapters.length; i++) {
      const ch = outline.chapters[i];
      const pct = 10 + (i / outline.chapters.length) * 80;
      setEbookProgress(`✍️ Writing Chapter ${i+1}/${outline.chapters.length}: ${ch.title}…`, pct);

      const chPrompt = `Write Chapter ${ch.number}: "${ch.title}" for the eBook titled "${outline.title}".
Audience: NEET, CBSE, Stateboard students.
Requirements:
- Write 600-900 words of detailed, accurate educational content
- Use CAPS for section headings within the chapter (e.g. INTRODUCTION, KEY CONCEPTS)
- Write in clear flowing paragraphs, no bullet symbols
- Include key definitions, examples, and important points
- Plain text only, no markdown symbols (no **, *, # or backticks)`;

      try {
        const r = await callAIWithFallback([{role:'user',content:chPrompt}], 2500);
        if (r) chapters.push({...ch, content: cleanAIText(r.text)});
        else chapters.push({...ch, content: `[Content for ${ch.title} could not be generated. Please retry.]`});
      } catch(_) {
        chapters.push({...ch, content: `[Content for ${ch.title} unavailable.]`});
      }
      // Small cooldown between calls to avoid rate-limiting
      await new Promise(res => setTimeout(res, 400));
    }

    setEbookProgress('📄 Building your PDF…', 93);
    await new Promise(res => setTimeout(res, 200));

    // Step 3: Build PDF
    try {
      const doc = buildEbookPDF(outline, chapters);
      const filename = (outline.title || topic).replace(/[^a-z0-9]/gi,'_').slice(0,40) + '_AIMSS.pdf';
      doc.save(filename);
      setEbookProgress('✅ eBook ready! Downloading…', 100);

      // Final success message
      setTimeout(() => {
        if (ebookProgressBubble) {
          ebookProgressBubble.classList.add('done');
          ebookProgressBubble.innerHTML = `
            <div class="cp-ebook-done">
              🎉 <strong>"${outline.title}"</strong> — ${chapters.length} chapters downloaded!<br>
              <span style="font-size:.8rem;opacity:.7">Check your Downloads folder</span>
            </div>
          `;
        }
        setStatus('✅ eBook Done');
        sendBtn.disabled = false;
      }, 1200);
    } catch(err) {
      if (ebookProgressBubble) ebookProgressBubble.textContent = '❌ PDF generation failed: ' + err.message;
      setStatus('❌ Failed');
      sendBtn.disabled = false;
    }
  }

  /* ═══════════════════════════════════════════════════
     SEND LOGIC (mode-aware)
  ═══════════════════════════════════════════════════ */
  const send = async () => {
    const msg = input.value.trim();
    if (!msg) return;
    addText(msg, 'user');
    input.value = '';
    sendBtn.disabled = true;

    const mode = CHAT_MODES[ACTIVE_CHAT_MODE];

    // ── eBook mode: launch PDF generator ──
    if (ACTIVE_CHAT_MODE === 'ebook') {
      await generateEbook(msg);
      return;
    }

    // ── Standard mode: chat with mode-specific system prompt ──
    const thinking = addText('Thinking…', 'bot thinking-bubble');
    setStatus('⏳ Thinking…');

    const queueTimer = setInterval(() => {
      const depth = typeof AIQueue !== 'undefined' ? AIQueue.depth : 0;
      if (depth > 0) {
        thinking.textContent = `⏳ Queued (${depth} ahead)…`;
        setStatus(`📥 Queued (${depth})`);
      } else {
        thinking.textContent = 'Thinking…';
      }
    }, 600);

    try {
      const result = await callAIWithFallback(
        [{role:'system', content: mode.systemPrompt}, {role:'user', content: msg}],
        mode.maxTokens
      );
      clearInterval(queueTimer);
      thinking.remove();

      if (!result) {
        addText('AI unavailable right now. Try again.', 'bot');
        setStatus('❌ Failed');
      } else {
        const prov = AI_PROVIDERS[result.usedProvider];
        const bubble = document.createElement('div');
        bubble.className = 'msg bot';
        const badgeClass = result.usedProvider === 'nvidia' ? 'badge-nvidia' : 'badge-geminipro';
        const modeBadge = ACTIVE_CHAT_MODE !== 'general'
          ? `<span class="ai-mode-badge" style="--mode-color:${mode.color}">${mode.icon} ${mode.label}</span>`
          : '';
        bubble.innerHTML = `<span class="ai-msg-text">${cleanAIText(result.text).replace(/\n/g,'<br>')}</span>${modeBadge}<span class="ai-model-badge ${badgeClass}">${prov.icon} ${prov.label}</span>`;

        // ── MCQ mode: add "Upload to Class" button ──
        if (ACTIVE_CHAT_MODE === 'mcq') {
          const rawText = result.text;
          const uploadRow = document.createElement('div');
          uploadRow.style.cssText = 'margin-top:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;';
          uploadRow.innerHTML = `
            <select id="mcqChatClassPicker" style="background:var(--surface-2);border:1px solid var(--line-hard);border-radius:8px;padding:6px 12px;color:var(--ink);font:inherit;font-size:.8rem;font-weight:700;outline:none;cursor:pointer;">
              <option value="">Select class…</option>
              <option value="6">Class 6</option><option value="7">Class 7</option>
              <option value="8">Class 8</option><option value="9">Class 9</option>
              <option value="10">Class 10</option><option value="11">Class 11</option>
              <option value="12">Class 12</option>
              <option value="neet">NEET</option><option value="jee">JEE</option>
              <option value="ncert">NCERT</option><option value="nda">NDA</option>
              <option value="upsc">UPSC</option><option value="tnpsc">TNPSC</option>
            </select>
            <select id="mcqChatBoardPicker" style="background:var(--surface-2);border:1px solid var(--line-hard);border-radius:8px;padding:6px 12px;color:var(--ink);font:inherit;font-size:.8rem;font-weight:700;outline:none;cursor:pointer;">
              <option value="">Select board (optional)…</option>
              <option value="stateboard">Stateboard</option>
              <option value="cbse">CBSE</option>
            </select>
            <button id="mcqChatUploadBtn" style="background:linear-gradient(135deg,#4ade80,#16a34a);border:none;border-radius:8px;padding:6px 14px;color:#000;font:inherit;font-size:.8rem;font-weight:800;cursor:pointer;">📤 Upload to Class</button>
            <span id="mcqChatUploadStatus" style="font-size:.78rem;color:var(--accent);"></span>
          `;
          uploadRow.querySelector('#mcqChatUploadBtn').addEventListener('click', () => {
            const classId = uploadRow.querySelector('#mcqChatClassPicker').value;
            const board = uploadRow.querySelector('#mcqChatBoardPicker').value;
            const statusEl = uploadRow.querySelector('#mcqChatUploadStatus');
            if (!classId) { statusEl.textContent = '⚠️ Pick a class first'; return; }
            // ── Teacher-only gate ──
            const role = (window.DrAuth && window.DrAuth.getRole()) || null;
            if (role !== 'teacher') {
              statusEl.innerHTML = `<span style="color:#f87171">⛔ Only teacher accounts can publish tests to classes.</span>`;
              return;
            }
            const qs = parseMcqText(rawText);
            if (!qs.length) { statusEl.textContent = '❌ Could not parse questions'; return; }
            const topicGuess = msg.length < 80 ? msg : msg.slice(0, 60) + '…';
            const finalClassId = board ? `${classId}-${board}` : classId;
            saveMcqBank(finalClassId, `${topicGuess} — ${finalClassId.toUpperCase().replace('-',' ')}`, qs);
            renderMcqBankManager && renderMcqBankManager();
            statusEl.innerHTML = `<span style="color:#4ade80">✅ Published ${qs.length} Qs!</span>`;
            showMcqToast && showMcqToast(`✅ ${qs.length} MCQs published to ${finalClassId.toUpperCase().replace('-',' ')}`);
          });
          bubble.appendChild(uploadRow);
        }

        log.appendChild(bubble);
        log.scrollTop = log.scrollHeight;
        setStatus(prov.icon + ' ' + prov.label);
      }
    } catch(_) {
      clearInterval(queueTimer);
      thinking.remove();
      addText('Network error. Please retry.', 'bot');
      setStatus('❌ Error');
    } finally {
      if (ACTIVE_CHAT_MODE !== 'ebook') sendBtn.disabled = false;
    }
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
  // Handled by supabase-auth.js on student-login.html / teacher-login.html
  // This stub is kept so old pages that call initLoginForm() don't throw errors.
}

function initRoleLogin() {
  // Handled by supabase-auth.js on student-login.html / teacher-login.html
  // This stub is kept so old pages that call initRoleLogin() don't throw errors.
}

function initPortalGuard() {
  // Guard is now handled per-page via DrAuth.guardPage() in supabase-auth.js.
  // student-dashboard.html  → DrAuth.guardPage('student')
  // command-center.html     → DrAuth.guardPage('teacher')
  // teacher-progress.html   → DrAuth.guardPage('teacher')
  // Login pages are public — no guard needed.
  // This stub is kept to avoid call-site errors in main.js.
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
  /* ══ TABS ══ */
  const tabs = document.querySelectorAll('.tp-tab');
  const panels = document.querySelectorAll('.tp-panel');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      panels.forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected','true');
      const target = document.getElementById('panel' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1));
      if (target) target.classList.add('active');
    });
  });

  /* ══ PROGRESS RECORDS ══ */
  const form = document.getElementById('progressForm');
  const body = document.getElementById('progressBody');
  const exportBtn = document.getElementById('exportProgressBtn');
  const filterClass = document.getElementById('filterClass');
  const filterBoard = document.getElementById('filterBoard');
  if (!form || !body) return;
  const key = 'student-progress-v1';

  const read = () => JSON.parse(localStorage.getItem(key) || '[]');
  const write = (rows) => localStorage.setItem(key, JSON.stringify(rows));

  window.deleteProgressRecord = (index) => {
    const rows = read();
    rows.splice(index, 1);
    write(rows);
    render();
    updateStats();
  };

  const updateStats = () => {
    const rows = read();
    const statsRow = document.getElementById('tpStatsRow');
    if (!statsRow) return;
    const total = rows.length;
    const avg = total ? Math.round(rows.reduce((s,r) => s + Number(r.score||0), 0) / total) : 0;
    const classes = new Set(rows.map(r => r.classId)).size;
    statsRow.innerHTML = [
      { val: total, lbl: 'Students' },
      { val: avg + '%', lbl: 'Avg Score' },
      { val: classes, lbl: 'Classes' }
    ].map(s => `<div class="tp-stat-card"><div class="tp-stat-val">${s.val}</div><div class="tp-stat-lbl">${s.lbl}</div></div>`).join('');
  };

  const render = () => {
    const rows = read();
    body.innerHTML = '';
    const fClass = filterClass ? filterClass.value : 'all';
    const fBoard = filterBoard ? filterBoard.value : 'all';

    let filtered = rows;
    if (fClass !== 'all') filtered = filtered.filter(r => r.classId === fClass);
    if (fBoard !== 'all') filtered = filtered.filter(r => r.board === fBoard);

    if (!filtered.length) {
      body.innerHTML = `<tr><td colspan="7"><div class="tp-empty"><div class="tp-empty-icon">📋</div><p class="tp-empty-text">No records found</p><p class="tp-empty-sub">Add student records using the form above.</p></div></td></tr>`;
      return;
    }

    filtered.forEach((r) => {
      const origIdx = rows.indexOf(r);
      const tr = document.createElement('tr');
      const classLabel = isNaN(r.classId) ? String(r.classId || '').toUpperCase() : 'Class ' + r.classId;
      const boardLabel = r.board === 'none' ? 'General' : String(r.board || '').toUpperCase();
      const sc = Number(r.score || 0);
      const scoreCls = sc >= 75 ? '' : sc >= 50 ? 'mid' : 'low';
      tr.innerHTML = `
        <td><strong style="color:#fff;">${r.name}</strong></td>
        <td><span class="tp-badge tp-badge-class">${classLabel}</span></td>
        <td><span class="tp-badge tp-badge-board">${boardLabel}</span></td>
        <td style="color:var(--muted);">${r.subject}</td>
        <td><span class="tp-badge tp-badge-score ${scoreCls}">${r.score}%</span></td>
        <td style="color:var(--muted);font-size:.82rem;">${r.note || '—'}</td>
        <td style="text-align:right;"><button class="tp-del-btn" onclick="deleteProgressRecord(${origIdx})">🗑 Delete</button></td>
      `;
      body.appendChild(tr);
    });
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const row = {
      name: String(fd.get('name') || '').trim(),
      classId: String(fd.get('classId') || '').trim(),
      board: String(fd.get('board') || '').trim(),
      subject: String(fd.get('subject') || '').trim(),
      score: Number(fd.get('score') || 0),
      note: String(fd.get('note') || '').trim()
    };
    if (!row.name || !row.subject || !row.classId) return;
    const rows = read();
    rows.unshift(row);
    write(rows);
    form.reset();
    render();
    updateStats();
    showToast('Student record added successfully!');
  });

  if (filterClass) filterClass.addEventListener('change', render);
  if (filterBoard) filterBoard.addEventListener('change', render);

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const rows = read();
      const lines = ['Student,Class,Board,Subject,Score,Note'];
      rows.forEach((r) => lines.push(`"${r.name}","${r.classId}","${r.board}","${r.subject}",${r.score},"${r.note}"`));
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
  updateStats();
}

/* ══ TOAST HELPER ══ */
function showToast(msg) {
  const toast = document.getElementById('tpSuccessToast');
  const msgEl = document.getElementById('tpToastMsg');
  if (!toast) return;
  if (msgEl) msgEl.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
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

      const result = await callAIWithFallback([
        { role: 'user', content: promptText }
      ], 900);

      if (!result) {
        status.textContent = 'AI unavailable. Please try again.';
        return;
      }
      const prov = AI_PROVIDERS[result.usedProvider];
      output.value = result.text || '';
      status.textContent = `Generated via ${prov.icon} ${prov.label}. Click Print/Save as PDF.`;
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

/* ═══════════════════════════════════════════════════════════════
   3D MCQ ANSWER ANIMATIONS
═══════════════════════════════════════════════════════════════ */

/** Spawn floating confetti particles */
function spawnConfetti(count) {
  const colors = ['#4ade80','#00e5cc','#f59e0b','#a78bfa','#fb923c','#67e8f9','#fde68a'];
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'mcq-confetti-piece';
    const x = Math.random() * 100;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const dur = 1.2 + Math.random() * 1.4;
    const delay = Math.random() * 0.4;
    const size = 6 + Math.random() * 10;
    p.style.cssText = `left:${x}vw;top:-20px;width:${size}px;height:${size*1.4}px;background:${color};animation-duration:${dur}s;animation-delay:${delay}s;border-radius:${Math.random()>0.5?'50%':'3px'};`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), (dur + delay) * 1000 + 200);
  }
}

/** Trigger correct answer 3D animation */
function triggerCorrectAnim(pts) {
  pts = pts || 5;
  const overlay = document.getElementById('mcqCorrectOverlay');
  const card    = document.getElementById('mcqCorrectCard');
  const badge   = document.getElementById('mcqPtsBadge');
  if (!overlay || !card) return;

  // Update badge text
  if (badge) badge.textContent = `+${pts} pts`;

  // Show overlay
  overlay.style.display = 'flex';
  card.classList.remove('pop-out');
  void card.offsetWidth; // reflow
  card.classList.add('pop-in');

  // Spawn confetti
  spawnConfetti(32);

  // Floating +pts text near center
  const floatEl = document.createElement('div');
  floatEl.className = 'mcq-float-pts';
  floatEl.textContent = `+${pts} pts`;
  floatEl.style.cssText = `left:calc(50% - 60px);top:45vh;`;
  document.body.appendChild(floatEl);
  setTimeout(() => floatEl.remove(), 1500);

  // Auto-hide
  setTimeout(() => {
    card.classList.remove('pop-in');
    card.classList.add('pop-out');
    setTimeout(() => {
      overlay.style.display = 'none';
      card.classList.remove('pop-out');
    }, 380);
  }, 1400);
}

/** Trigger wrong answer animation */
function triggerWrongAnim() {
  const overlay = document.getElementById('mcqWrongOverlay');
  const box     = document.getElementById('mcqBox');
  if (!overlay) return;

  overlay.style.display = 'flex';
  overlay.classList.remove('flash-in');
  void overlay.offsetWidth;
  overlay.classList.add('flash-in');

  if (box) {
    box.classList.remove('mcq-shake');
    void box.offsetWidth;
    box.classList.add('mcq-shake');
    setTimeout(() => box.classList.remove('mcq-shake'), 700);
  }

  setTimeout(() => {
    overlay.style.display = 'none';
    overlay.classList.remove('flash-in');
  }, 750);
}

/** Enhanced awardPoints — also tracks history & badges */
function awardPointsTracked(pts, label, type) {
  type  = type  || 'mcq';
  label = label || `MCQ test completed`;
  const cur = parseInt(localStorage.getItem('student-points') || '0');
  const next = cur + pts;
  localStorage.setItem('student-points', String(next));

  // Append to history
  const history = JSON.parse(localStorage.getItem('student-points-history') || '[]');
  history.push({ pts, label, type, ts: Date.now() });
  localStorage.setItem('student-points-history', JSON.stringify(history));

  // Sync sidebar pts
  ['sideStorePts', 'sidePointsText'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = next + ' pts';
  });
  const bar = document.getElementById('sidePointsBar');
  if (bar) bar.style.width = Math.min(100, Math.round(next / 10)) + '%';
}

/* ═══════════════════════════════════════════════════════════════
   MCQ BANK HELPERS  — teacher-published, class-keyed
═══════════════════════════════════════════════════════════════ */

/** Parse raw AI MCQ text into [{q, a[], c}] array */
function parseMcqText(raw) {
  // Normalize the raw text: strip markdown bold/italic, clean up
  const text = raw.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const questions = [];

  // ── Strategy 1: Split on "Q<N>." or "<N>." question markers ──
  // This handles both "Q1." and "1." numbered formats
  const rawBlocks = [];
  let lastIdx = 0;
  let match;
  const splitRe = /(?:^|\n)\s*(?:Q\s*)?(\d+)\s*[\.\)]\s+/gi;
  while ((match = splitRe.exec(text)) !== null) {
    if (lastIdx < match.index) rawBlocks.push(text.slice(lastIdx, match.index));
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) rawBlocks.push(text.slice(lastIdx));
  const blocks = rawBlocks.filter(b => b.trim().length > 0);

  blocks.forEach(block => {
    // ── Try to extract question text, options, answer from block ──

    // Split options by detecting "A)" / "A." at start of line or after whitespace
    // This works for BOTH multi-line AND inline format (no lookbehind for broad browser compat)
    const optRe = /(?:(?:^|\n)\s*|\s)([A-Da-d])\s*[\.\)]\s+/g;
    const optPositions = [];
    let om;
    while ((om = optRe.exec(block)) !== null) {
      optPositions.push({ idx: om.index, label: om[1].toUpperCase(), end: om.index + om[0].length });
    }

    // Extract question text = everything before first option marker
    let qText = '';
    if (optPositions.length >= 2) {
      qText = block.slice(0, optPositions[0].idx).replace(/\n/g, ' ').trim();
    } else {
      // Fallback: first line is question
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
      qText = lines[0] || '';
    }
    qText = qText.replace(/^[\*\#\-]+/, '').trim();
    if (!qText) return;

    // Extract options text
    const opts = [];
    for (let i = 0; i < optPositions.length && i < 4; i++) {
      const start = optPositions[i].end;
      const end = i + 1 < optPositions.length ? optPositions[i + 1].idx : block.length;
      let optText = block.slice(start, end).replace(/\n/g, ' ').trim();
      // Strip trailing "Answer: X" if it got merged into last option
      optText = optText.replace(/\s*[Aa]nswer\s*[:\-]\s*[A-Da-d]\s*$/, '').trim();
      if (optText) opts.push(optText);
    }

    // Extract answer
    let correctIdx = 0;
    const ansMatch = block.match(/[Aa]nswer\s*[:\-]\s*([A-Da-d])/);
    if (ansMatch) correctIdx = Math.max(0, 'ABCD'.indexOf(ansMatch[1].toUpperCase()));

    if (opts.length >= 2) {
      questions.push({ q: qText, a: opts.slice(0, 4), c: correctIdx });
    }
  });

  // ── Strategy 2 fallback: if Strategy 1 yielded nothing, try line-by-line ──
  if (questions.length === 0) {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let curQ = null, curOpts = [], curAns = '';
    const flush = () => {
      if (curQ && curOpts.length >= 2) {
        const ci = curAns ? Math.max(0, 'ABCD'.indexOf(curAns)) : 0;
        questions.push({ q: curQ, a: curOpts.slice(0, 4), c: ci });
      }
      curQ = null; curOpts = []; curAns = '';
    };
    lines.forEach(line => {
      if (/^(?:Q\s*)?\d+[\.\)]\s+/.test(line)) {
        flush();
        curQ = line.replace(/^(?:Q\s*)?\d+[\.\)]\s+/, '').replace(/^[\*\#]+/, '').trim();
      } else if (/^[A-Da-d][\.\)]\s+/.test(line)) {
        curOpts.push(line.replace(/^[A-Da-d][\.\)]\s+/, '').trim());
      } else if (/^[Aa]nswer\s*[:\-]\s*([A-Da-d])/.test(line)) {
        const m = line.match(/^[Aa]nswer\s*[:\-]\s*([A-Da-d])/);
        if (m) curAns = m[1].toUpperCase();
      }
    });
    flush();
  }

  return questions;
}

/** Save a named MCQ bank for a class */
function saveMcqBank(classId, title, questions) {
  const id = `mcqbank-${Date.now()}`;
  const bank = { id, classId, title, questions, createdAt: new Date().toISOString() };
  const raw = JSON.parse(localStorage.getItem('mcq-banks-index') || '[]');
  raw.unshift({ id, classId, title, count: questions.length, createdAt: bank.createdAt });
  localStorage.setItem('mcq-banks-index', JSON.stringify(raw));
  localStorage.setItem(`mcq-bank-${id}`, JSON.stringify(bank));
  return id;
}

/** Load index of all banks, optionally filtered by classId */
function loadMcqBankIndex(classId = null) {
  const raw = JSON.parse(localStorage.getItem('mcq-banks-index') || '[]');
  if (!classId) return raw;
  return raw.filter(b => b.classId === classId);
}

/** Load a single bank by id */
function loadMcqBank(id) {
  return JSON.parse(localStorage.getItem(`mcq-bank-${id}`) || 'null');
}

/** Delete a bank */
function deleteMcqBank(id) {
  const raw = JSON.parse(localStorage.getItem('mcq-banks-index') || '[]');
  localStorage.setItem('mcq-banks-index', JSON.stringify(raw.filter(b => b.id !== id)));
  localStorage.removeItem(`mcq-bank-${id}`);
}

/* ═══════════════════════════════════════════════════════════════
   TEACHER MCQ MANAGER — Command Center
═══════════════════════════════════════════════════════════════ */
function initTeacherMcqManager() {
  /* ── Tab switcher ── */
  const tabAI   = document.getElementById('mcqTabAI');
  const tabFile = document.getElementById('mcqTabFile');
  const panelAI   = document.getElementById('mcqPanelAI');
  const panelFile = document.getElementById('mcqPanelFile');
  if (!tabAI || !tabFile) return;

  const switchMcqTab = (tab) => {
    tabAI.classList.toggle('active', tab === 'ai');
    tabFile.classList.toggle('active', tab === 'file');
    panelAI.style.display   = tab === 'ai'   ? '' : 'none';
    panelFile.style.display = tab === 'file' ? '' : 'none';
  };
  tabAI.addEventListener('click',   () => switchMcqTab('ai'));
  tabFile.addEventListener('click', () => switchMcqTab('file'));

  /* ── Shared preview state ── */
  let pendingQuestions = [];
  let pendingClass = '';
  let pendingTitle = '';

  const previewWrap   = document.getElementById('mcqPreviewWrap');
  const previewBody   = document.getElementById('mcqPreviewBody');
  const publishBtn    = document.getElementById('mcqPublishBtn');
  const previewCount  = document.getElementById('mcqPreviewCount');

  function showPreview(questions, classId, title) {
    pendingQuestions = questions;
    pendingClass     = classId;
    pendingTitle     = title;
    previewCount.textContent = `${questions.length} question${questions.length !== 1 ? 's' : ''} ready`;
    previewBody.innerHTML = '';
    questions.forEach((q, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="color:var(--accent);font-weight:700;width:32px">${i+1}</td>
        <td style="font-weight:600">${q.q}</td>
        <td>${q.a.map((opt, ai) => `<span style="color:${ai===q.c?'#4ade80':'var(--muted)'}${ai===q.c?';font-weight:700':''}">${'ABCD'[ai]}) ${opt}</span>`).join(' ')}</td>
      `;
      previewBody.appendChild(tr);
    });
    previewWrap.style.display = '';
    publishBtn.disabled = questions.length === 0;
    previewWrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* Publish button */
  publishBtn && publishBtn.addEventListener('click', () => {
    if (!pendingQuestions.length) return;
    saveMcqBank(pendingClass, pendingTitle, pendingQuestions);
    renderMcqBankManager();
    showMcqToast(`✅ Published "${pendingTitle}" to Class ${pendingClass} (${pendingQuestions.length} Qs)`);
    previewWrap.style.display = 'none';
    pendingQuestions = [];
    // Reset forms
    const aiForm   = document.getElementById('mcqAiForm');
    const fileForm = document.getElementById('mcqFileForm');
    if (aiForm)   aiForm.reset();
    if (fileForm) fileForm.reset();
    document.getElementById('mcqFileStatusMsg') && (document.getElementById('mcqFileStatusMsg').textContent = '');
  });

  /* ── AI GENERATE panel ── */
  const aiForm   = document.getElementById('mcqAiForm');
  const aiStatus = document.getElementById('mcqAiStatus');
  aiForm && aiForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const topic   = document.getElementById('mcqAiTopic').value.trim();
    const classId = document.getElementById('mcqAiClass').value;
    const count   = parseInt(document.getElementById('mcqAiCount').value) || 10;
    const diff    = document.getElementById('mcqAiDiff').value;
    if (!topic || !classId) { aiStatus.textContent = 'Please fill all fields.'; return; }

    aiStatus.innerHTML = '<span style="color:var(--accent)">⏳ Generating questions with AI…</span>';
    const genBtn = document.getElementById('mcqAiGenBtn');
    genBtn.disabled = true;

    const prompt = `You are Dr.AIMSS MCQ expert. Generate exactly ${count} ${diff} difficulty MCQ questions on: "${topic}" for Class ${classId} students (NEET/CBSE/Stateboard).

Format each question EXACTLY like this (no extra text before or after):
Q1. [Question text]
A) option1 B) option2 C) option3 D) option4
Answer: [Letter]

Q2. [Question text]
...

Generate all ${count} questions now. Make them exam-quality. Plain text only.`;

    try {
      const result = await callAIWithFallback([{ role: 'user', content: prompt }], 4000);
      if (!result) throw new Error('AI unavailable');
      const qs = parseMcqText(result.text);
      if (qs.length === 0) throw new Error('Could not parse questions');
      const title = `${topic} — Class ${classId}`;
      showPreview(qs, classId, title);
      aiStatus.innerHTML = `<span style="color:#4ade80">✅ ${qs.length} questions generated!</span>`;
    } catch (err) {
      aiStatus.innerHTML = `<span style="color:#f87171">❌ ${err.message}. Try again.</span>`;
    } finally {
      genBtn.disabled = false;
    }
  });

  /* ── FILE UPLOAD panel ── */
  const fileForm   = document.getElementById('mcqFileForm');
  const fileInput  = document.getElementById('mcqFileInput');
  const fileStatus = document.getElementById('mcqFileStatusMsg');

  fileForm && fileForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const classId = document.getElementById('mcqFileClass').value;
    const count   = parseInt(document.getElementById('mcqFileCount').value) || 10;
    const file    = fileInput && fileInput.files[0];
    if (!file || !classId) { fileStatus.textContent = 'Please select a file and class.'; return; }

    fileStatus.innerHTML = '<span style="color:var(--accent)">⏳ Reading file…</span>';
    const uploadBtn = document.getElementById('mcqFileUploadBtn');
    uploadBtn.disabled = true;

    try {
      let text = '';
      const ext = file.name.split('.').pop().toLowerCase();

      if (ext === 'txt') {
        text = await file.text();
      } else if (ext === 'pdf') {
        // Use PDF.js if available
        if (window.pdfjsLib) {
          const buf = await file.arrayBuffer();
          const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
          const pages = [];
          for (let p = 1; p <= Math.min(pdf.numPages, 15); p++) {
            const page = await pdf.getPage(p);
            const content = await page.getTextContent();
            pages.push(content.items.map(i => i.str).join(' '));
          }
          text = pages.join('\n\n');
        } else {
          throw new Error('PDF reading requires PDF.js. Please upload a .txt or .docx file instead.');
        }
      } else if (ext === 'docx') {
        // Basic DOCX text extraction (reads raw XML text)
        const buf = await file.arrayBuffer();
        const uint8 = new Uint8Array(buf);
        // Look for word/document.xml in the zip
        const decoder = new TextDecoder('utf-8');
        const str = decoder.decode(uint8);
        // Extract text between XML tags
        const xmlMatches = str.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
        text = xmlMatches.map(m => m.replace(/<[^>]+>/g, '')).join(' ');
        if (!text.trim()) throw new Error('Could not extract text from DOCX. Try saving as .txt first.');
      } else {
        // Try to read as plain text
        text = await file.text();
      }

      if (!text || text.trim().length < 30) throw new Error('File appears to be empty or unreadable.');

      fileStatus.innerHTML = '<span style="color:var(--accent)">🤖 AI converting to MCQ format…</span>';
      // Truncate if too long
      const trimmed = text.slice(0, 6000);
      const prompt = `You are Dr.AIMSS MCQ expert. Read the following educational content and generate exactly ${count} MCQ questions from it for Class ${classId} students.

CONTENT:
${trimmed}

Format each question EXACTLY like this:
Q1. [Question text]
A) option1 B) option2 C) option3 D) option4
Answer: [Letter]

Q2. [Question text]
...

Generate all ${count} questions now. Questions must be based strictly on the content above. Plain text only.`;

      const result = await callAIWithFallback([{ role: 'user', content: prompt }], 4000);
      if (!result) throw new Error('AI unavailable');
      const qs = parseMcqText(result.text);
      if (qs.length === 0) throw new Error('Could not parse questions from AI response');
      const title = `${file.name.replace(/\.[^\.]+$/, '')} — Class ${classId}`;
      showPreview(qs, classId, title);
      fileStatus.innerHTML = `<span style="color:#4ade80">✅ ${qs.length} questions extracted from file!</span>`;
    } catch (err) {
      fileStatus.innerHTML = `<span style="color:#f87171">❌ ${err.message}</span>`;
    } finally {
      uploadBtn.disabled = false;
    }
  });

  /* ── MCQ Bank Manager ── */
  renderMcqBankManager();
}

function renderMcqBankManager() {
  const wrap = document.getElementById('mcqBankList');
  if (!wrap) return;
  const banks = loadMcqBankIndex();
  if (!banks.length) {
    wrap.innerHTML = `<div class="empty-state"><div class="es-icon">📭</div><h3>No Tests Published Yet</h3><p>Generate or upload MCQs above to publish tests.</p></div>`;
    return;
  }
  const classColors = {
    '6': '#06b6d4', '7': '#8b5cf6', '8': '#f59e0b', '9': '#10b981', '10': '#ef4444',
    '11': '#00e5cc', '12': '#ffd700', 'neet': '#f97316', 'jee': '#a78bfa',
    'ncert': '#ec4899', 'nda': '#34d399', 'upsc': '#3b82f6', 'tnpsc': '#fb7185', 'tnspc': '#fb7185'
  };
  wrap.innerHTML = `
    <table class="file-table" style="margin-top:4px">
      <thead><tr>
        <th>Test Title</th><th>Class</th><th>Questions</th><th>Created</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${banks.map(b => `
          <tr>
            <td><div class="file-name-cell"><span style="font-size:1.1rem">📝</span><span class="file-name-text" title="${b.title}">${b.title}</span></div></td>
            <td>
              <span style="background:${classColors[b.classId.split('-')[0]]||'#00e5cc'}22;border:1px solid ${classColors[b.classId.split('-')[0]]||'#00e5cc'}44;color:${classColors[b.classId.split('-')[0]]||'#00e5cc'};padding:2px 10px;border-radius:999px;font-size:.76rem;font-weight:800">
                ${isNaN(b.classId.split('-')[0]) ? b.classId.toUpperCase() : 'Class ' + b.classId.toUpperCase().replace('-',' ')}
              </span>
            </td>
            <td style="font-weight:700;color:var(--accent)">${b.count}</td>
            <td style="color:var(--muted);font-size:.8rem">${new Date(b.createdAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'})}</td>
            <td>
              <button class="action-btn btn-del" onclick="deleteMcqBank('${b.id}');renderMcqBankManager();showMcqToast('🗑️ Test deleted.')">🗑 Delete</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function showMcqToast(msg) {
  let toast = document.getElementById('mcqToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'mcqToast';
    toast.style.cssText = 'position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(60px);background:linear-gradient(135deg,#080810,#0d0d18);border:1px solid var(--line-hard);border-radius:12px;padding:12px 22px;font-size:.88rem;font-weight:700;color:var(--ink);box-shadow:0 20px 60px rgba(0,0,0,0.8);z-index:99999;transition:transform .3s cubic-bezier(.34,1.56,.64,1),opacity .3s;opacity:0;white-space:nowrap';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  requestAnimationFrame(() => { toast.style.transform = 'translateX(-50%) translateY(0)'; toast.style.opacity = '1'; });
  clearTimeout(toast._to);
  toast._to = setTimeout(() => { toast.style.transform = 'translateX(-50%) translateY(60px)'; toast.style.opacity = '0'; }, 3200);
}

/* ═══════════════════════════════════════════════════════════════
   STUDENT MCQ TEST — class-picker + bank-picker + quiz flow
═══════════════════════════════════════════════════════════════ */
function initMcqTest() {
  const box     = document.getElementById('mcqBox');
  const nextBtn = document.getElementById('mcqNext');
  const scoreEl = document.getElementById('mcqScore');
  if (!box || !nextBtn || !scoreEl) return;

  // Detect new-style page with class/bank selectors
  const classSelect = document.getElementById('mcqClassSelect');
  const bankList    = document.getElementById('mcqBankList2');
  const testArea    = document.getElementById('mcqTestArea');

  if (classSelect && bankList) {
    /* ── NEW STUDENT UI: class picker → bank picker → quiz ── */
    nextBtn.style.display = 'none';
    testArea && (testArea.style.display = 'none');

    let activeQuestions = [];
    let idx = 0, score = 0, locked = false;

    const renderBankList = () => {
      const cid = classSelect.value;
      if (!cid) { bankList.innerHTML = '<p style="color:var(--muted);text-align:center">Select your class above ☝️</p>'; return; }
      const banks = loadMcqBankIndex(cid);
      if (!banks.length) {
        bankList.innerHTML = `<div class="empty-state"><div class="es-icon">📭</div><h3>No Tests for Class ${cid}</h3><p>Your teacher hasn't published any tests yet.</p></div>`;
        return;
      }
      bankList.innerHTML = banks.map(b => `
        <div class="mcq-bank-card" data-id="${b.id}" style="background:var(--surface);border:1.5px solid var(--line);border-radius:14px;padding:16px 18px;cursor:pointer;transition:all .2s;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px">
          <div>
            <div style="font-weight:800;font-size:.96rem;color:var(--ink);margin-bottom:3px">📝 ${b.title}</div>
            <div style="font-size:.78rem;color:var(--muted)">${b.count} questions • ${new Date(b.createdAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'2-digit'})}</div>
          </div>
          <button class="btn" style="flex-shrink:0;font-size:.82rem;padding:8px 18px" onclick="event.stopPropagation();startMcqBank('${b.id}')">Start Test ▶</button>
        </div>
      `).join('');
    };
    classSelect.addEventListener('change', renderBankList);
    renderBankList();

    window.startMcqBank = (bankId) => {
      const bank = loadMcqBank(bankId);
      if (!bank || !bank.questions.length) return;
      activeQuestions = bank.questions;
      idx = 0; score = 0; locked = false;
      bankList.style.display = 'none';
      classSelect.closest('.mcq-class-row') && (classSelect.closest('.mcq-class-row').style.display = 'none');
      testArea && (testArea.style.display = '');
      nextBtn.style.display = '';
      nextBtn.disabled = false;
      scoreEl.textContent = `Score: 0/${activeQuestions.length}`;
      const bankTitle = document.getElementById('mcqBankTitle');
      if (bankTitle) bankTitle.textContent = `📝 ${bank.title}`;
      renderQ();
    };

    const renderQ = () => {
      locked = false;
      const cur = activeQuestions[idx];
      box.innerHTML = `<h3 style="margin-bottom:14px">Q${idx + 1}. ${cur.q}</h3>`;
      cur.a.forEach((opt, i) => {
        const b = document.createElement('button');
        b.className = 'mcq-option';
        b.type = 'button';
        b.textContent = `${'ABCD'[i]}) ${opt}`;
        b.addEventListener('click', () => {
          if (locked) return;
          locked = true;
          box.querySelectorAll('.mcq-option').forEach((btn, bi) => {
            if (bi === cur.c) btn.classList.add('correct');
            else if (bi === i && i !== cur.c) btn.classList.add('wrong');
          });
          if (i === cur.c) {
            score++;
            // Track per-answer correct count & badge
            const cc = parseInt(localStorage.getItem('student-correct-total') || '0') + 1;
            localStorage.setItem('student-correct-total', String(cc));
            if (cc === 1) {
              const badges = JSON.parse(localStorage.getItem('student-badges') || '[]');
              if (!badges.includes('first-correct')) { badges.push('first-correct'); localStorage.setItem('student-badges', JSON.stringify(badges)); }
            }
            awardPointsTracked(5, `Correct answer — Q${idx+1}`, 'mcq');
            triggerCorrectAnim(5);
          } else {
            triggerWrongAnim();
          }
          scoreEl.textContent = `Score: ${score}/${activeQuestions.length}`;
        });
        box.appendChild(b);
      });
    };

    nextBtn.addEventListener('click', () => {
      idx++;
      if (idx >= activeQuestions.length) {
        const pct = Math.round((score / activeQuestions.length) * 100);
        localStorage.setItem('latest-mcq-score', String(pct));
        // Track tests taken
        const tt = parseInt(localStorage.getItem('student-tests-taken') || '0') + 1;
        localStorage.setItem('student-tests-taken', String(tt));
        if (tt === 1) {
          const badges = JSON.parse(localStorage.getItem('student-badges') || '[]');
          if (!badges.includes('test')) { badges.push('test'); localStorage.setItem('student-badges', JSON.stringify(badges)); }
        }
        // Final bonus for test completion logged in history
        awardPointsTracked(0, `Test completed — ${score}/${activeQuestions.length} (${pct}%)`, 'mcq');
        awardPoints(score * 5);
        initStudentRewards && initStudentRewards();
        box.innerHTML = `
          <div style="text-align:center;padding:20px 0">
            <div style="font-size:3rem;margin-bottom:12px">${pct >= 80 ? '🏆' : pct >= 50 ? '✅' : '📚'}</div>
            <h2 style="margin-bottom:8px">Test Complete!</h2>
            <div style="font-size:2rem;font-weight:800;color:var(--accent);margin-bottom:6px">${pct}%</div>
            <p style="color:var(--muted)">Score: ${score} / ${activeQuestions.length}</p>
            <button class="btn" style="margin-top:16px" onclick="location.reload()">↩ Try Another Test</button>
          </div>`;
        nextBtn.style.display = 'none';
        return;
      }
      renderQ();
    });

  } else {
    /* ── LEGACY fallback: default questions only ── */
    const defaultQuestions = [
      { q: 'What is the SI unit of force?', a: ['Newton', 'Joule', 'Watt', 'Pascal'], c: 0 },
      { q: 'DNA full form is?', a: ['Deoxyribo Nucleic Acid', 'Dynamic Nuclear Acid', 'Double Nitrogen Atom', 'None'], c: 0 },
      { q: '2 + 3 x 4 = ?', a: ['20', '14', '24', '11'], c: 1 },
      { q: 'Plant food preparation process?', a: ['Respiration', 'Photosynthesis', 'Transpiration', 'Digestion'], c: 1 }
    ];
    const custom = JSON.parse(localStorage.getItem('custom-mcqs-v1') || '[]');
    const questions = [...defaultQuestions, ...custom];
    let idx = 0, score = 0, locked = false;

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
          if (i === cur.c) { b.classList.add('correct'); score++; }
          else b.classList.add('wrong');
          scoreEl.textContent = `Score: ${score}/${questions.length}`;
        });
        box.appendChild(b);
      });
    };

    nextBtn.addEventListener('click', () => {
      idx++;
      if (idx >= questions.length) {
        localStorage.setItem('latest-mcq-score', String(Math.round((score / questions.length) * 100)));
        awardPoints(score * 5);
        initStudentRewards && initStudentRewards();
        box.innerHTML = `<h3>Test Complete</h3><p>Your score is ${score}/${questions.length}.</p>`;
        nextBtn.disabled = true;
        return;
      }
      render();
    });
    render();
  }
}

function initTeacherMcq() {
  // Legacy single-question creator — kept for backward compat
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
  const grid = document.getElementById('driveGrid');
  const breadcrumbs = document.getElementById('driveBreadcrumbs');
  const btnNewFolder = document.getElementById('btnNewFolder');
  const btnUploadVideo = document.getElementById('btnUploadVideo');
  
  if (!grid || !breadcrumbs) return;

  const VID_KEY = 'lectureVideosList';
  const FLD_KEY = 'lectureFoldersList';
  
  const readVideos = () => JSON.parse(localStorage.getItem(VID_KEY) || '[]');
  const writeVideos = (list) => localStorage.setItem(VID_KEY, JSON.stringify(list));
  const readFolders = () => JSON.parse(localStorage.getItem(FLD_KEY) || '[]');
  const writeFolders = (list) => localStorage.setItem(FLD_KEY, JSON.stringify(list));

  let currentPath = localStorage.getItem('aimss-drive-path') || '/';

  // Classes & Boards for root levels
  const CLASSES = ['Class 6','Class 7','Class 8','Class 9','Class 10','Class 11','Class 12','NEET','JEE','NCERT','NDA','UPSC','TNPSC'];
  const BOARDS = ['Stateboard', 'CBSE', 'General'];

  // Robust YouTube Extractor
  const extractYoutubeId = (input) => {
    if (!input) return null;
    let str = input.trim();
    if (str.includes('<iframe')) {
      const match = str.match(/src=["']([^"']+)["']/i);
      if (match && match[1]) str = match[1];
    }
    str = str.replace(/&amp;/g,'&').replace(/&#39;/g,"'");
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\?v=|&v=)([^#&?]*).*/;
    const m = str.match(regExp);
    if (m && m[2] && m[2].length === 11) return m[2];
    const cleaned = str.split('?')[0].split('/').pop();
    if (cleaned && cleaned.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(cleaned)) return cleaned;
    if (str.length === 11 && /^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
    return null;
  };

  const getPathSegments = (path) => path.split('/').filter(Boolean);

  window.navigateToPath = (path) => {
    currentPath = path;
    localStorage.setItem('aimss-drive-path', currentPath);
    renderDrive();
  };

  // Render Breadcrumbs
  const renderBreadcrumbs = () => {
    const segments = getPathSegments(currentPath);
    let html = `<div class="breadcrumb-item" onclick="navigateToPath('/')">🏠 Root</div>`;
    let buildPath = '';
    
    segments.forEach((seg, i) => {
      buildPath += '/' + seg;
      html += `<span class="breadcrumb-separator">/</span>`;
      if (i === segments.length - 1) {
        html += `<div class="breadcrumb-item active">${seg}</div>`;
      } else {
        html += `<div class="breadcrumb-item" onclick="navigateToPath('${buildPath}/')">${seg}</div>`;
      }
    });
    breadcrumbs.innerHTML = html;
  };

  // Render Grid
  const renderDrive = () => {
    renderBreadcrumbs();
    grid.innerHTML = '';
    const segments = getPathSegments(currentPath);
    const depth = segments.length;

    // Show/hide action buttons
    if (depth >= 2) {
      // Inside a specific Class and Board
      if(btnNewFolder) btnNewFolder.style.display = 'inline-flex';
      if(btnUploadVideo) btnUploadVideo.style.display = 'inline-flex';
    } else {
      if(btnNewFolder) btnNewFolder.style.display = 'none';
      if(btnUploadVideo) btnUploadVideo.style.display = 'none';
    }

    if (depth === 0) {
      // Render Root Classes
      CLASSES.forEach(cls => {
        const card = document.createElement('div');
        card.className = 'drive-card';
        card.innerHTML = `<div class="drive-icon">📚</div><div class="drive-name">${cls}</div>`;
        card.onclick = () => navigateToPath('/' + cls + '/');
        grid.appendChild(card);
      });
      return;
    }

    if (depth === 1) {
      // Render Boards for the selected Class
      const isPrep = ['NEET','JEE','NCERT','NDA','UPSC','TNPSC'].includes(segments[0]);
      const boardsToShow = isPrep ? ['General'] : BOARDS;
      boardsToShow.forEach(brd => {
        const card = document.createElement('div');
        card.className = 'drive-card';
        card.innerHTML = `<div class="drive-icon">🎯</div><div class="drive-name">${brd}</div>`;
        card.onclick = () => navigateToPath('/' + segments[0] + '/' + brd + '/');
        grid.appendChild(card);
      });
      return;
    }

    // Depth >= 2: We are inside a Class/Board. Render Subfolders and Videos for current path
    const folders = readFolders().filter(f => f.parentPath === currentPath);
    const videos = readVideos().filter(v => {
      if (v.parentPath === currentPath) return true;
      if (!v.parentPath && segments.length === 2 && v.classLevel === segments[0] && v.board === segments[1]) return true;
      return false;
    });

    if (folders.length === 0 && videos.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--muted);">
          <div style="font-size: 3rem; opacity: 0.3; margin-bottom: 10px;">📂</div>
          <div style="font-weight: 700; font-size: 1.1rem; color: #fff;">This folder is empty</div>
          <div style="font-size: 0.9rem; margin-top: 5px;">Create a subfolder or upload a video here.</div>
        </div>
      `;
      return;
    }

    // Render Folders
    folders.forEach(f => {
      const card = document.createElement('div');
      card.className = 'drive-card';
      card.innerHTML = `
        <div class="drive-icon">📁</div>
        <div class="drive-name">${f.name}</div>
        <div class="drive-card-delete" onclick="event.stopPropagation(); deleteFolder('${f.id}')" title="Delete Folder">🗑</div>
      `;
      card.onclick = () => navigateToPath(currentPath + f.name + '/');
      grid.appendChild(card);
    });

    // Render Videos
    videos.forEach(v => {
      const card = document.createElement('div');
      card.className = 'drive-card video-card';
      card.innerHTML = `
        <div class="drive-thumb">
          <img src="https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg" alt="${v.title}" loading="lazy" />
          <div class="drive-play">
            <svg viewBox="0 0 52 52"><polygon points="18,12 40,26 18,40" /></svg>
          </div>
        </div>
        <div class="drive-video-info">
          <div class="drive-video-title">${v.title}</div>
          <div class="drive-video-meta">${new Date(v.addedAt || Date.now()).toLocaleDateString()}</div>
        </div>
        <div class="drive-card-delete" onclick="event.stopPropagation(); deleteVideo('${v.id}')" title="Delete Video">🗑</div>
      `;
      card.onclick = () => openPlayer(v);
      grid.appendChild(card);
    });
  };

  /* ══ MODALS & ACTIONS ══ */
  const modalFolder = document.getElementById('modalNewFolder');
  const modalUpload = document.getElementById('modalUploadVideo');

  window.closeFolderModal = () => { if(modalFolder) modalFolder.classList.remove('open'); };
  window.closeUploadModal = () => { if(modalUpload) modalUpload.classList.remove('open'); };

  if(btnNewFolder) btnNewFolder.onclick = () => {
    document.getElementById('driveFolderForm').reset();
    modalFolder.classList.add('open');
    setTimeout(() => document.getElementById('modalFolderNameInput').focus(), 100);
  };
  
  if(btnUploadVideo) btnUploadVideo.onclick = () => {
    document.getElementById('driveUploadForm').reset();
    const status = document.getElementById('modalUploadStatus');
    if(status) status.textContent = '';
    modalUpload.classList.add('open');
    setTimeout(() => document.getElementById('modalVideoTitleInput').focus(), 100);
  };

  document.getElementById('btnCloseFolderModal')?.addEventListener('click', closeFolderModal);
  document.getElementById('btnCancelFolderModal')?.addEventListener('click', closeFolderModal);
  document.getElementById('btnCloseUploadModal')?.addEventListener('click', closeUploadModal);
  document.getElementById('btnCancelUploadModal')?.addEventListener('click', closeUploadModal);

  // Create Folder Submit
  const folderForm = document.getElementById('driveFolderForm');
  if (folderForm) {
    folderForm.onsubmit = (e) => {
      e.preventDefault();
      let name = document.getElementById('modalFolderNameInput').value.trim();
      if (!name) return;
      // sanitize name to avoid slash issues
      name = name.replace(/\//g, '-');
      
      const folders = readFolders();
      // Check duplicate
      if (folders.some(f => f.parentPath === currentPath && f.name.toLowerCase() === name.toLowerCase())) {
        alert('A folder with this name already exists here.');
        return;
      }
      
      folders.push({
        id: 'fld_' + Date.now().toString(36),
        name: name,
        parentPath: currentPath,
        addedAt: new Date().toISOString()
      });
      writeFolders(folders);
      closeFolderModal();
      renderDrive();
    };
  }

  // Upload Video Submit
  const uploadForm = document.getElementById('driveUploadForm');
  if (uploadForm) {
    uploadForm.onsubmit = (e) => {
      e.preventDefault();
      const title = document.getElementById('modalVideoTitleInput').value.trim();
      const urlInput = document.getElementById('modalVideoUrlInput').value.trim();
      const status = document.getElementById('modalUploadStatus');

      if (!title || !urlInput) return;
      const videoId = extractYoutubeId(urlInput);

      if (!videoId) {
        if(status) { status.textContent = "Invalid YouTube URL or iframe code."; status.style.color = '#f87171'; }
        return;
      }

      // backward compatibility for classLevel and board
      const segments = getPathSegments(currentPath);
      const cls = segments[0] || 'Unknown';
      const brd = segments[1] || 'Unknown';

      const videos = readVideos();
      videos.unshift({
        id: 'vid_' + Date.now().toString(36),
        title: title,
        videoId: videoId,
        parentPath: currentPath,
        classLevel: cls,
        board: brd,
        addedAt: new Date().toISOString()
      });
      writeVideos(videos);

      if(status) { status.textContent = "Video uploaded successfully!"; status.style.color = '#4ade80'; }
      
      const toast = document.getElementById('tpSuccessToast');
      const toastMsg = document.getElementById('tpToastMsg');
      if (toast && toastMsg) {
        toastMsg.textContent = 'Video "' + title + '" uploaded!';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
      }

      setTimeout(() => {
        closeUploadModal();
        renderDrive();
      }, 800);
    };
  }

  /* ══ DELETE ACTIONS ══ */
  window.deleteFolder = (id) => {
    if (!confirm('Are you sure you want to delete this folder and ALL its contents?')) return;
    const folders = readFolders();
    const folderToDelete = folders.find(f => f.id === id);
    if (!folderToDelete) return;

    const pathToDelete = folderToDelete.parentPath + folderToDelete.name + '/';
    
    // Remove the folder itself
    const updatedFolders = folders.filter(f => f.id !== id && !f.parentPath.startsWith(pathToDelete));
    writeFolders(updatedFolders);

    // Remove all videos inside this folder and its subfolders
    const videos = readVideos();
    const updatedVideos = videos.filter(v => !v.parentPath.startsWith(pathToDelete));
    writeVideos(updatedVideos);

    renderDrive();
  };

  window.deleteVideo = (id) => {
    if (!confirm('Delete this video?')) return;
    const videos = readVideos();
    writeVideos(videos.filter(v => v.id !== id));
    renderDrive();
  };

  /* ══ VIDEO PLAYER MODAL ══ */
  const playerOverlay = document.getElementById('vidPlayerOverlay');
  const playerFrame = document.getElementById('vidPlayerFrame');
  const playerTitle = document.getElementById('vidPlayerTitle');
  const playerMeta = document.getElementById('vidPlayerMeta');
  const playerClose = document.getElementById('vidPlayerClose');
  const playerYTBtn = document.getElementById('vidPlayerYTBtn');

  window.openPlayer = (vid) => {
    if (!playerOverlay || !playerFrame) return;
    if (playerTitle) playerTitle.textContent = vid.title;
    if (playerMeta) {
      const segs = getPathSegments(vid.parentPath);
      playerMeta.textContent = segs.join(' • ');
    }
    playerFrame.src = `https://www.youtube.com/embed/${vid.videoId}?autoplay=1&rel=0&modestbranding=1`;
    if (playerYTBtn) playerYTBtn.onclick = () => window.open('https://www.youtube.com/watch?v=' + vid.videoId, '_blank');
    playerOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  const closePlayer = () => {
    if (!playerOverlay) return;
    playerOverlay.classList.remove('open');
    if (playerFrame) playerFrame.src = '';
    document.body.style.overflow = '';
  };

  if (playerClose) playerClose.addEventListener('click', closePlayer);
  if (playerOverlay) playerOverlay.addEventListener('click', (e) => { if (e.target === playerOverlay) closePlayer(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && playerOverlay && playerOverlay.classList.contains('open')) closePlayer(); });

  // Initial Render
  renderDrive();
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
initTeacherMcqManager();
initMobileNav();

/* ══ MOBILE NAV — injected dynamically on every page ══ */
function initMobileNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;

  // Avoid double-inject
  if (nav.querySelector('.nav-hamburger')) return;

  /* 1. Inject hamburger button into nav — insert BEFORE nav-tools so order is
     [Brand]  [nav-links desktop]  [Apply btn]  [☰ Hamburger]
     On mobile nav-links is hidden, Apply is hidden, hamburger stays right. */
  const ham = document.createElement('button');
  ham.className = 'nav-hamburger';
  ham.setAttribute('aria-label', 'Open menu');
  ham.setAttribute('aria-expanded', 'false');
  ham.innerHTML = '<span></span><span></span><span></span>';
  const navTools = nav.querySelector('.nav-tools');
  if (navTools) {
    nav.insertBefore(ham, navTools.nextSibling); // insert AFTER nav-tools
  } else {
    nav.appendChild(ham);
  }

  /* 2. Build mobile nav drawer */
  const drawer = document.createElement('div');
  drawer.className = 'mobile-nav-drawer';
  drawer.id = 'mobileNavDrawer';
  drawer.innerHTML = `
    <div class="mobile-nav-overlay" id="mobileNavOverlay"></div>
    <div class="mobile-nav-panel">
      <div class="mobile-nav-head">
        <strong>📚 Dr.AIMSS</strong>
        <button class="mobile-nav-close" id="mobileNavClose" aria-label="Close menu">✕</button>
      </div>
      <nav class="mobile-nav-links">
        <a href="index.html">🏠 Home</a>
        <a href="index.html#programs">📖 Programs</a>
        <a href="matric.html">📚 Stateboard</a>
        <a href="cbse.html">🎓 CBSE</a>
        <a href="lectures.html">🎬 Video Lectures</a>
        <a href="mcq-test.html">📊 MCQ Tests</a>
        <a href="study-materials.html">📄 Study Materials</a>
        <a href="ai-pdf-generator.html">🤖 AI PDF Generator</a>
        <a href="login.html">🔐 Login</a>
        <a href="login.html">🏛️ Command Center</a>
      </nav>
      <div class="mobile-nav-footer">
        <a class="btn" href="index.html#admission">Apply Now</a>
      </div>
    </div>
  `;
  document.body.appendChild(drawer);

  /* 3. Wire open/close */
  const openDrawer = () => {
    drawer.classList.add('open');
    ham.classList.add('open');
    ham.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  };
  const closeDrawer = () => {
    drawer.classList.remove('open');
    ham.classList.remove('open');
    ham.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };

  ham.addEventListener('click', openDrawer);
  document.getElementById('mobileNavClose')?.addEventListener('click', closeDrawer);
  document.getElementById('mobileNavOverlay')?.addEventListener('click', closeDrawer);

  // Close on link click
  drawer.querySelectorAll('.mobile-nav-links a').forEach(a => {
    a.addEventListener('click', closeDrawer);
  });

  // Close on Escape key
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
}

function initStudentVideo() {
  const grid = document.getElementById('studentDriveGrid');
  const breadcrumbs = document.getElementById('studentDriveBreadcrumbs');
  
  if (!grid || !breadcrumbs) return;

  const VID_KEY = 'lectureVideosList';
  const FLD_KEY = 'lectureFoldersList';
  
  const readVideos = () => JSON.parse(localStorage.getItem(VID_KEY) || '[]');
  const readFolders = () => JSON.parse(localStorage.getItem(FLD_KEY) || '[]');

  let currentPath = localStorage.getItem('aimss-student-drive-path') || '/';

  // Classes & Boards for root levels
  const CLASSES = ['Class 6','Class 7','Class 8','Class 9','Class 10','Class 11','Class 12','NEET','JEE','NCERT','NDA','UPSC','TNPSC'];
  const BOARDS = ['Stateboard', 'CBSE', 'General'];

  const getPathSegments = (path) => path.split('/').filter(Boolean);

  window.navigateStudentToPath = (path) => {
    currentPath = path;
    localStorage.setItem('aimss-student-drive-path', currentPath);
    renderStudentDrive();
  };

  // Render Breadcrumbs
  const renderBreadcrumbs = () => {
    const segments = getPathSegments(currentPath);
    let html = `<div class="breadcrumb-item" onclick="navigateStudentToPath('/')">ðŸ  Root</div>`;
    let buildPath = '';
    
    segments.forEach((seg, i) => {
      buildPath += '/' + seg;
      html += `<span class="breadcrumb-separator">/</span>`;
      if (i === segments.length - 1) {
        html += `<div class="breadcrumb-item active">${seg}</div>`;
      } else {
        html += `<div class="breadcrumb-item" onclick="navigateStudentToPath('${buildPath}/')">${seg}</div>`;
      }
    });
    breadcrumbs.innerHTML = html;
  };

  // Render Grid
  const renderStudentDrive = () => {
    renderBreadcrumbs();
    grid.innerHTML = '';
    const segments = getPathSegments(currentPath);
    const depth = segments.length;

    if (depth === 0) {
      CLASSES.forEach(cls => {
        const card = document.createElement('div');
        card.className = 'drive-card';
        card.innerHTML = `<div class="drive-icon">📚</div><div class="drive-name">${cls}</div>`;
        card.onclick = () => navigateStudentToPath('/' + cls + '/');
        grid.appendChild(card);
      });
      return;
    }

    if (depth === 1) {
      const isPrep = ['NEET','JEE','NCERT','NDA','UPSC','TNPSC'].includes(segments[0]);
      const boardsToShow = isPrep ? ['General'] : BOARDS;
      boardsToShow.forEach(brd => {
        const card = document.createElement('div');
        card.className = 'drive-card';
        card.innerHTML = `<div class="drive-icon">🎯</div><div class="drive-name">${brd}</div>`;
        card.onclick = () => navigateStudentToPath('/' + segments[0] + '/' + brd + '/');
        grid.appendChild(card);
      });
      return;
    }

    const folders = readFolders().filter(f => f.parentPath === currentPath);
    const videos = readVideos().filter(v => {
      if (v.parentPath === currentPath) return true;
      if (!v.parentPath && segments.length === 2 && v.classLevel === segments[0] && v.board === segments[1]) return true;
      return false;
    });

    if (folders.length === 0 && videos.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--muted);">
          <div style="font-size: 3rem; opacity: 0.3; margin-bottom: 10px;">📂</div>
          <div style="font-weight: 700; font-size: 1.1rem; color: #fff;">This folder is empty</div>
        </div>
      `;
      return;
    }

    folders.forEach(f => {
      const card = document.createElement('div');
      card.className = 'drive-card';
      card.innerHTML = `
        <div class="drive-icon">ðŸ“</div>
        <div class="drive-name">${f.name}</div>
      `;
      card.onclick = () => navigateStudentToPath(currentPath + f.name + '/');
      grid.appendChild(card);
    });

    videos.forEach(v => {
      const card = document.createElement('div');
      card.className = 'drive-card video-card';
      card.innerHTML = `
        <div class="drive-thumb">
          <img src="https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg" alt="${v.title}" loading="lazy" />
          <div class="drive-play">
            <svg viewBox="0 0 52 52"><polygon points="18,12 40,26 18,40" /></svg>
          </div>
        </div>
        <div class="drive-video-info">
          <div class="drive-video-title">${v.title}</div>
          <div class="drive-video-meta">${new Date(v.addedAt || Date.now()).toLocaleDateString()}</div>
        </div>
      `;
      card.onclick = () => openStudentPlayer(v);
      grid.appendChild(card);
    });
  };

  /* â•â• VIDEO PLAYER MODAL â•â• */
  const playerOverlay = document.getElementById('vidPlayerOverlay');
  const playerFrame = document.getElementById('vidPlayerFrame');
  const playerTitle = document.getElementById('vidPlayerTitle');
  const playerMeta = document.getElementById('vidPlayerMeta');
  const playerClose = document.getElementById('vidPlayerClose');
  const playerYTBtn = document.getElementById('vidPlayerYTBtn');

  window.openStudentPlayer = (vid) => {
    if (!playerOverlay || !playerFrame) return;
    if (playerTitle) playerTitle.textContent = vid.title;
    if (playerMeta) {
      const segs = getPathSegments(vid.parentPath);
      playerMeta.textContent = segs.join(' • ');
    }
    playerFrame.src = `https://www.youtube.com/embed/${vid.videoId}?autoplay=1&rel=0&modestbranding=1`;
    if (playerYTBtn) playerYTBtn.onclick = () => window.open('https://www.youtube.com/watch?v=' + vid.videoId, '_blank');
    playerOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  };

  const closePlayer = () => {
    if (!playerOverlay) return;
    playerOverlay.classList.remove('open');
    if (playerFrame) playerFrame.src = '';
    document.body.style.overflow = '';
  };

  if (playerClose) playerClose.addEventListener('click', closePlayer);
  if (playerOverlay) playerOverlay.addEventListener('click', (e) => { if (e.target === playerOverlay) closePlayer(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && playerOverlay && playerOverlay.classList.contains('open')) closePlayer(); });

  // Initial Render
  renderStudentDrive();
}
initStudentVideo();

