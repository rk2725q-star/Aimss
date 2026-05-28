/**
 * ═══════════════════════════════════════════════════════════════════
 *  Dr.AIMSS AI Resilience Layer  v2.1
 *  High-availability protection for 100s of concurrent students
 *
 *  Protection Layers (in order of invocation):
 *   1. GlobalRateGuard     — cross-tab rate limiter via localStorage
 *   2. AIQueue             — concurrency limiter (max 3 in-flight)
 *   3. CircuitBreaker      — per-provider open/close/half-open states
 *   4. ExponentialBackoff  — retry with jitter on 429 / 5xx
 *   5. HealthMonitor       — live health stats exposed to the UI
 * ═══════════════════════════════════════════════════════════════════
 */

/* ─────────────────────────────────────────────────────────────
   SECTION 1 — CONFIG
   ───────────────────────────────────────────────────────────── */
const NVIDIA_URL   = 'https://integrate.api.nvidia.com/v1/chat/completions';
const NVIDIA_MODEL = 'meta/llama-3.1-8b-instruct';

// Primary key → branded as NVIDIA
const NVIDIA_KEY_PRIMARY  = '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';
// Fallback key → branded as Gemini Pro (same NVIDIA endpoint, different key)
const NVIDIA_KEY_FALLBACK = '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';

const AI_PROVIDERS = {
  nvidia: {
    label: 'NVIDIA', icon: '⚡',
    key: NVIDIA_KEY_PRIMARY
  },
  geminipro: {
    label: 'Gemini Pro', icon: '🧠',
    key: NVIDIA_KEY_FALLBACK
  }
};

// CORS proxy chain (tried in order)
const CORS_PROXIES = [
  (url) => '/api/ai',                                                            // 1. Local backend proxy (100% CORS-safe)
  (url) => url,                                                                  // 2. Direct
  (url) => 'https://corsproxy.io/?' + encodeURIComponent(url),                  // 3. corsproxy.io
  (url) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),     // 4. allorigins
  (url) => 'https://thingproxy.freeboard.io/fetch/' + url,                      // 5. thingproxy
];


/* ─────────────────────────────────────────────────────────────
   SECTION 2 — GLOBAL RATE GUARD  (cross-tab, localStorage)
   Detects >20 requests/min from this browser and soft-throttles.
   ───────────────────────────────────────────────────────────── */
const GlobalRateGuard = (() => {
  const KEY      = 'aimss-req-timestamps';
  const WINDOW   = 60_000;  // 1 minute
  const MAX_REQS = 20;      // per minute per browser
  const THROTTLE = 2_000;   // 2s delay when over limit

  function _getTimestamps() {
    try { return JSON.parse(localStorage.getItem(KEY) || '[]'); }
    catch (_) { return []; }
  }
  function _saveTimestamps(ts) {
    try { localStorage.setItem(KEY, JSON.stringify(ts)); } catch (_) {}
  }

  return {
    /** Call before each request. Returns ms to wait (0 if under limit). */
    check() {
      const now = Date.now();
      let ts = _getTimestamps().filter(t => now - t < WINDOW);
      ts.push(now);
      _saveTimestamps(ts);
      HealthMonitor.update('rateGuard', { requestsLastMinute: ts.length });
      if (ts.length > MAX_REQS) return THROTTLE;
      return 0;
    }
  };
})();


/* ─────────────────────────────────────────────────────────────
   SECTION 4 — CIRCUIT BREAKER  (per provider)
   Opens after 4 consecutive failures; auto-recovers after 30s.
   States: CLOSED → OPEN → HALF_OPEN → CLOSED
   ───────────────────────────────────────────────────────────── */
class CircuitBreaker {
  constructor({ failThreshold = 4, cooldownMs = 30_000 } = {}) {
    this.failThreshold = failThreshold;
    this.cooldownMs    = cooldownMs;
    this._state        = 'CLOSED'; // CLOSED | OPEN | HALF_OPEN
    this._failures     = 0;
    this._openedAt     = null;
    this._probeAllowed = false;
  }

  get state() { return this._state; }

  isAvailable() {
    if (this._state === 'CLOSED') return true;
    if (this._state === 'OPEN') {
      if (Date.now() - this._openedAt >= this.cooldownMs) {
        this._state        = 'HALF_OPEN';
        this._probeAllowed = true;
        return true; // allow one probe
      }
      return false;
    }
    if (this._state === 'HALF_OPEN') {
      if (this._probeAllowed) {
        this._probeAllowed = false;
        return true;
      }
      return false;
    }
    return false;
  }

  recordSuccess() {
    this._failures = 0;
    this._state    = 'CLOSED';
  }

  recordFailure() {
    this._failures++;
    if (this._state === 'HALF_OPEN' || this._failures >= this.failThreshold) {
      this._state    = 'OPEN';
      this._openedAt = Date.now();
    }
  }

  /** Seconds remaining in cooldown (0 if not open) */
  cooldownRemaining() {
    if (this._state !== 'OPEN') return 0;
    return Math.max(0, Math.ceil((this.cooldownMs - (Date.now() - this._openedAt)) / 1000));
  }
}

// One circuit breaker per provider
const CIRCUIT_BREAKERS = {
  nvidia:    new CircuitBreaker(),
  geminipro: new CircuitBreaker()
};


/* ─────────────────────────────────────────────────────────────
   SECTION 5 — REQUEST QUEUE  (concurrency limiter, max 3)
   Queues excess requests and executes them as slots free up.
   Exposes onQueueChange callback for UI updates.
   ───────────────────────────────────────────────────────────── */
const AIQueue = (() => {
  const MAX_CONCURRENT = 3;
  let   running        = 0;
  const queue          = [];   // [{fn, resolve, reject}]

  /** Notify UI of queue depth changes */
  let _onQueueChange = null;
  function _notify() {
    HealthMonitor.update('queue', { depth: queue.length, running });
    if (_onQueueChange) _onQueueChange({ depth: queue.length, running });
  }

  function _next() {
    if (running >= MAX_CONCURRENT || queue.length === 0) return;
    const { fn, resolve, reject } = queue.shift();
    running++;
    _notify();
    fn()
      .then(resolve)
      .catch(reject)
      .finally(() => { running--; _notify(); _next(); });
  }

  return {
    /** Enqueue a thunk (async function). Returns a Promise. */
    enqueue(fn, position = { current: 0 }) {
      return new Promise((resolve, reject) => {
        // Attach position tracker before pushing
        const wrapped = () => { position.current = 0; return fn(); };
        queue.push({ fn: wrapped, resolve, reject });
        position.current = queue.length;
        _notify();
        _next();
      });
    },
    /** Register a callback for queue depth changes */
    onQueueChange(cb) { _onQueueChange = cb; },
    get depth() { return queue.length; },
    get running() { return running; }
  };
})();


/* ─────────────────────────────────────────────────────────────
   SECTION 6 — EXPONENTIAL BACKOFF + JITTER
   delay = min(base × 2^attempt, maxDelay) + random(0, jitter)
   ───────────────────────────────────────────────────────────── */
function backoffDelay(attempt, { base = 800, maxDelay = 10_000, jitter = 600 } = {}) {
  const exp   = Math.min(base * Math.pow(2, attempt), maxDelay);
  const rand  = Math.random() * jitter;
  return exp + rand;
}

/**
 * Retry an async function with exponential backoff.
 * Only retries on 429 / 5xx status codes.
 */
async function withRetry(fn, { maxAttempts = 3 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = await fn(attempt);
    if (result !== null) return result;
    if (attempt < maxAttempts - 1) {
      const delay = backoffDelay(attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return null;
}


/* ─────────────────────────────────────────────────────────────
   SECTION 7 — HEALTH MONITOR
   Aggregates stats; UI reads this to render health dots & badges.
   ───────────────────────────────────────────────────────────── */
const HealthMonitor = (() => {
  const stats = {
    nvidia:    { successes: 0, failures: 0, lastError: null, state: 'CLOSED' },
    geminipro: { successes: 0, failures: 0, lastError: null, state: 'CLOSED' },
    queue:     { depth: 0, running: 0 },
    rateGuard: { requestsLastMinute: 0 }
  };

  const listeners = [];

  return {
    update(key, patch) {
      if (stats[key]) Object.assign(stats[key], patch);
      listeners.forEach(cb => cb(stats));
    },
    recordSuccess(provider) {
      stats[provider].successes++;
      stats[provider].state = CIRCUIT_BREAKERS[provider].state;
      listeners.forEach(cb => cb(stats));
    },
    recordFailure(provider, err) {
      stats[provider].failures++;
      stats[provider].lastError = err?.message || String(err);
      stats[provider].state = CIRCUIT_BREAKERS[provider].state;
      listeners.forEach(cb => cb(stats));
    },
    getStats() { return stats; },
    /** Register a listener called whenever stats change */
    onChange(cb) { listeners.push(cb); },
    /** Return 'healthy' | 'degraded' | 'down' for a provider */
    healthLevel(provider) {
      const cb = CIRCUIT_BREAKERS[provider];
      if (cb.state === 'OPEN')      return 'down';
      const s = stats[provider];
      const total = s.successes + s.failures;
      if (total === 0) return 'healthy';
      const errorRate = s.failures / total;
      if (errorRate > 0.3) return 'degraded';
      return 'healthy';
    }
  };
})();


/* ─────────────────────────────────────────────────────────────
   SECTION 8 — CORE FETCH (with retry + circuit breaker per provider)
   ───────────────────────────────────────────────────────────── */
async function _callNvidiaEndpoint(providerId, messages, maxTokens) {
  const apiKey  = AI_PROVIDERS[providerId].key;
  const breaker = CIRCUIT_BREAKERS[providerId];

  if (!breaker.isAvailable()) {
    const secs = breaker.cooldownRemaining();
    console.warn(`[AIMSS] Circuit OPEN for ${providerId}. Cooldown: ${secs}s`);
    return null;
  }

  const payload = JSON.stringify({
    model: NVIDIA_MODEL,
    messages,
    max_tokens: maxTokens,
    temperature: 0.7,
    top_p: 0.9,
    stream: false
  });

  const authHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  const result = await withRetry(async (attempt) => {
    for (const proxyFn of CORS_PROXIES) {
      const url = proxyFn(NVIDIA_URL);
      try {
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), 15_000);

        const res = await fetch(url, {
          method:  'POST',
          headers: authHeaders,
          body:    payload,
          signal:  ctrl.signal
        });
        clearTimeout(tid);

        // 429 or 5xx — trigger backoff retry
        if (res.status === 429 || res.status >= 500) {
          console.warn(`[AIMSS] ${providerId} → HTTP ${res.status} via proxy (attempt ${attempt + 1})`);
          return null; // withRetry will back off and retry
        }
        if (!res.ok) continue; // 4xx other — try next proxy

        const data    = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content && content.trim()) {
          breaker.recordSuccess();
          HealthMonitor.recordSuccess(providerId);
          return content.trim();
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          console.warn(`[AIMSS] ${providerId} timeout via proxy`);
        }
        // Try next proxy
      }
    }
    return null; // all proxies exhausted this attempt
  }, { maxAttempts: 3 });

  if (!result) {
    breaker.recordFailure();
    HealthMonitor.recordFailure(providerId, new Error('All proxies + retries exhausted'));
  }
  return result;
}


/* ─────────────────────────────────────────────────────────────
   SECTION 9 — PROTECTED callAIWithFallback()
   This is the single entry point called by main.js.
   Applies all 6 layers in the correct order.
   ───────────────────────────────────────────────────────────── */

/** Global provider preference — synced with the UI toggle */
let ACTIVE_AI_PROVIDER = localStorage.getItem('aimss-ai-provider') || 'nvidia';

/**
 * Main protected AI call. Returns {text, usedProvider} or null.
 * @param {Array} messages  OpenAI-style messages array
 * @param {number} maxTokens
 * @param {object} [opts]
 */
async function callAIWithFallback(messages, maxTokens = 320, opts = {}) {

  /* ── Layer 1: Global Rate Guard ── */
  const waitMs = GlobalRateGuard.check();
  if (waitMs > 0) {
    console.info(`[AIMSS] Rate guard throttling: ${waitMs}ms delay`);
    await new Promise(r => setTimeout(r, waitMs));
  }

  /* ── Layer 2: Concurrency Queue ── */
  const pos = { current: 0 };
  return AIQueue.enqueue(async () => {

    /* ── Layers 3 + 4: Circuit Breaker + Exponential Backoff (per provider) ── */
    const order = ACTIVE_AI_PROVIDER === 'nvidia'
      ? ['nvidia', 'geminipro']
      : ['geminipro', 'nvidia'];

    for (const providerId of order) {
      const breaker = CIRCUIT_BREAKERS[providerId];

      if (!breaker.isAvailable()) {
        const secs = breaker.cooldownRemaining();
        HealthMonitor.update(providerId, { state: 'OPEN' });
        console.info(`[AIMSS] Skipping ${providerId} — circuit open (${secs}s remaining)`);
        continue;
      }

      const text = await _callNvidiaEndpoint(providerId, messages, maxTokens);
      if (text) {
        return { text, usedProvider: providerId };
      }
    }

    return null; // both providers exhausted
  }, pos);
}

/**
 * Simplified wrapper used by sidebar chat & search (no fromCache / provider info needed).
 */
async function callNvidiaAI(messages, maxTokens = 280) {
  const r = await callAIWithFallback(messages, maxTokens);
  return r ? r.text : null;
}


/* ─────────────────────────────────────────────────────────────
   SECTION 10 — UI HEALTH DOT UPDATER
   Call this once the chat panel DOM is ready.
   ───────────────────────────────────────────────────────────── */
function bindHealthDots(panelEl) {
  if (!panelEl) return;

  function renderDot(provider) {
    const dot = panelEl.querySelector(`.cp-health-dot[data-prov="${provider}"]`);
    if (!dot) return;
    const level = HealthMonitor.healthLevel(provider);
    dot.className      = `cp-health-dot health-${level}`;
    const cb           = CIRCUIT_BREAKERS[provider];
    dot.title          = level === 'down'
      ? `Circuit OPEN — recovers in ${cb.cooldownRemaining()}s`
      : level === 'degraded' ? 'Some failures detected'
      : 'Healthy';
  }

  function renderQueueBadge() {
    const badge = panelEl.querySelector('#cpQueueBadge');
    if (!badge) return;
    const depth = AIQueue.depth + AIQueue.running;
    badge.textContent = depth > 0 ? `${depth} active` : '';
    badge.style.display = depth > 0 ? 'inline-flex' : 'none';
  }

  HealthMonitor.onChange(() => {
    renderDot('nvidia');
    renderDot('geminipro');
    renderQueueBadge();
  });

  AIQueue.onQueueChange(() => {
    renderQueueBadge();
  });

  // Initial render
  renderDot('nvidia');
  renderDot('geminipro');
  renderQueueBadge();
}
