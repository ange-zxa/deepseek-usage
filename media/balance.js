// @ts-check
/// <reference lib="dom" />

const vscode = acquireVsCodeApi();

const dashboard = document.getElementById('dashboard');

const WHALE = {
  normal: document.body.dataset.whaleNormal || '',
  surprised: document.body.dataset.whaleSurprised || '',
  sleepy: document.body.dataset.whaleSleepy || '',
  happy: document.body.dataset.whaleHappy || '',
  thinking: document.body.dataset.whaleThinking || '',
};

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.type !== 'balanceUpdate') return;
  render(msg.balance, msg.error, msg.noApiKey);
});

// Tell the extension the webview is ready to receive messages. The extension
// owns the refresh timer and will push the latest balance down.
vscode.postMessage({ type: 'ready' });

// One delegated listener survives every innerHTML re-render.
dashboard?.addEventListener('click', (event) => {
  const target = event.target;
  const el = target instanceof Element ? target.closest('[data-action]') : null;
  if (!el) return;
  const action = el.getAttribute('data-action');
  if (action === 'refresh') {
    doRefresh();
  } else if (action === 'setApiKey') {
    vscode.postMessage({ type: 'setApiKey' });
  }
});

/**
 * @param {{ isAvailable: boolean; currency: string; totalBalance: string; grantedBalance: string; toppedUpBalance: string; } | null} balance
 * @param {string} [error]
 * @param {boolean} [noApiKey]
 */
function render(balance, error, noApiKey) {
  if (!dashboard) return;

  if (noApiKey) {
    dashboard.innerHTML = getSetupHTML(error || 'No API key configured');
    return;
  }

  if (error) {
    dashboard.innerHTML = getErrorHTML(error);
    return;
  }

  if (!balance || !balance.isAvailable) {
    dashboard.innerHTML = getErrorHTML('Balance unavailable');
    return;
  }

  const total = toNumber(balance.totalBalance);
  const granted = toNumber(balance.grantedBalance);
  const toppedUp = toNumber(balance.toppedUpBalance);
  const toppedUpShare = Math.min((toppedUp / (total || 1)) * 100, 100);
  const low = total < 10;

  const mood = low ? 'sleepy' : total >= 50 ? 'happy' : 'normal';
  const bubble = low
    ? 'Running low… maybe top up soon?'
    : total >= 50
      ? 'Plenty of balance — happy coding!'
      : 'Balance looks steady.';

  dashboard.innerHTML =
    mascotScene(mood, bubble, 'refresh') +
    '<div class="balance-card">' +
    '<div class="balance-label">Total Balance</div>' +
    '<div class="balance-amount" id="balance-amount">' +
    formatNumber(total) +
    '</div>' +
    '<div class="balance-currency">' +
    escapeHtml(balance.currency) +
    '</div>' +
    '</div>' +
    '<div class="sub-cards">' +
    '<div class="sub-card">' +
    '<div class="sub-card-icon">🎁</div>' +
    '<div class="sub-card-label">Granted</div>' +
    '<div class="sub-card-value">' +
    formatNumber(granted) +
    '</div>' +
    '</div>' +
    '<div class="sub-card">' +
    '<div class="sub-card-icon">💳</div>' +
    '<div class="sub-card-label">Topped Up</div>' +
    '<div class="sub-card-value">' +
    formatNumber(toppedUp) +
    '</div>' +
    '</div>' +
    '</div>' +
    '<div class="progress-section">' +
    '<div class="progress-header">' +
    '<span title="Share of your current balance that came from top-ups">Topped-up share</span>' +
    '<span>' +
    (toppedUpShare < 0.1 ? '0' : toppedUpShare.toFixed(1)) +
    '%</span>' +
    '</div>' +
    '<div class="progress-bar"><div class="progress-fill ' +
    (low ? 'low' : '') +
    '" id="progress-fill" style="width:0%"></div></div>' +
    '</div>' +
    '<button class="refresh-btn" data-action="refresh">' +
    '<span class="icon">🔄</span> Refresh' +
    '</button>' +
    '<div class="status-bar">' +
    '<span class="status-dot' +
    (low ? ' error' : '') +
    '"></span>' +
    '<span id="status-text">Updated just now</span>' +
    '</div>';

  updateTimestamp();

  requestAnimationFrame(() => {
    const bar = document.getElementById('progress-fill');
    if (bar) bar.style.width = toppedUpShare + '%';
  });
}

/**
 * @param {'normal' | 'surprised' | 'sleepy' | 'happy'} mood
 * @param {string} text
 * @param {string} [action]
 */
function mascotScene(mood, text, action) {
  const actionAttr = action ? ' data-action="' + action + '"' : '';
  const src = WHALE[mood] || WHALE.normal;
  return (
    '<div class="mascot-scene">' +
    '<div class="speech" role="status">' +
    escapeHtml(text) +
    '</div>' +
    '<div class="mascot-wrap" id="mascot-wrap">' +
    '<img class="mascot" id="mascot" src="' +
    src +
    '" alt="Whale girl mascot"' +
    actionAttr +
    ' draggable="false">' +
    '</div>' +
    '</div>'
  );
}

/** @param {string} message */
function getSetupHTML(message) {
  return (
    mascotScene(
      'surprised',
      'Hi! I need an API key before I can check your balance.'
    ) +
    '<div class="setup-card">' +
    '<h2>Set Up DeepSeek</h2>' +
    '<p>' +
    escapeHtml(message) +
    '</p>' +
    '<button class="setup-btn" data-action="setApiKey">Set API Key Securely</button>' +
    '<p class="setup-note">🔒 Your key is stored in the system keychain, never in plain text.</p>' +
    '</div>'
  );
}

/** @param {string} error */
function getErrorHTML(error) {
  return (
    mascotScene('surprised', "I couldn't reach DeepSeek just now.", 'refresh') +
    '<div class="error-card">' +
    '<h2>Something went wrong</h2>' +
    '<p class="error-detail">' +
    escapeHtml(error) +
    '</p>' +
    '<div class="action-row">' +
    '<button class="refresh-btn" data-action="refresh"><span class="icon">🔄</span> Try again</button>' +
    '<button class="btn-secondary" data-action="setApiKey">Update API Key</button>' +
    '</div>' +
    '</div>'
  );
}

function doRefresh() {
  showThinking();
  vscode.postMessage({ type: 'refreshBalance' });
}

function showThinking() {
  const img = /** @type {HTMLImageElement | null} */ (
    document.getElementById('mascot')
  );
  if (img && WHALE.thinking) img.src = WHALE.thinking;

  const wrap = document.getElementById('mascot-wrap');
  if (wrap) wrap.classList.add('thinking');

  const speech = document.querySelector('.speech');
  if (speech) speech.textContent = 'Checking your balance…';

  const button = document.querySelector('.refresh-btn');
  if (button) button.classList.add('refreshing');
}

function updateTimestamp() {
  const statusText = document.getElementById('status-text');
  if (!statusText) return;
  const now = new Date();
  const time = now.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  statusText.textContent = 'Updated at ' + time;
}

/**
 * @param {string} value
 * @returns {number}
 */
function toNumber(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {number} n
 * @returns {string}
 */
function formatNumber(n) {
  return (Number.isFinite(n) ? n : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
