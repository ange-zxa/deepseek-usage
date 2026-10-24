// @ts-check
/// <reference lib="dom" />

const vscode = acquireVsCodeApi();

const dashboard = document.getElementById('dashboard');
const MASCOTS = ['🐳', '🦭', '🦋', '🐣', '🐙', '🦊', '🐶', '🐱', '🐼', '🦄'];

// Pick a random mascot (stable per session)
const mascot = MASCOTS[Math.floor(Math.random() * MASCOTS.length)];

window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || msg.type !== 'balanceUpdate') return;
  render(msg.balance, msg.error);
});

// Tell the extension the webview is ready to receive messages. The extension
// owns the refresh timer and will push the latest balance down.
vscode.postMessage({ type: 'ready' });

/**
 * @param {{ isAvailable: boolean; currency: string; totalBalance: string; grantedBalance: string; toppedUpBalance: string; } | null} balance
 * @param {string} [error]
 */
function render(balance, error) {
  if (!dashboard) return;

  if (error) {
    dashboard.innerHTML = getSetupHTML(error);
    bindSetupButton();
    return;
  }

  if (!balance || !balance.isAvailable) {
    dashboard.innerHTML = getSetupHTML('Balance unavailable');
    bindSetupButton();
    return;
  }

  const total = parseFloat(balance.totalBalance);
  const granted = parseFloat(balance.grantedBalance);
  const toppedUp = parseFloat(balance.toppedUpBalance);
  const toppedUpShare = Math.min((toppedUp / (total || 1)) * 100, 100);

  const level = total >= 100 ? 'Plentiful 🌟' : total >= 50 ? 'Comfortable ✨' : total >= 10 ? 'Moderate 💫' : 'Low 😅';
  const progressClass = total < 10 ? 'low' : '';

  dashboard.innerHTML = ''
    + '<div class="mascot" id="mascot" title="Click to refresh">' + mascot + '</div>'
    + '<div class="greeting">' + level + '</div>'
    + '<div class="balance-card">'
    +   '<div class="balance-label">Total Balance</div>'
    +   '<div class="balance-amount" id="balance-amount">' + formatNumber(total) + '</div>'
    +   '<div class="balance-currency">' + escapeHtml(balance.currency) + '</div>'
    + '</div>'
    + '<div class="sub-cards">'
    +   '<div class="sub-card">'
    +     '<div class="sub-card-icon">🎁</div>'
    +     '<div class="sub-card-label">Granted</div>'
    +     '<div class="sub-card-value">' + formatNumber(granted) + '</div>'
    +   '</div>'
    +   '<div class="sub-card">'
    +     '<div class="sub-card-icon">💳</div>'
    +     '<div class="sub-card-label">Topped Up</div>'
    +     '<div class="sub-card-value">' + formatNumber(toppedUp) + '</div>'
    +   '</div>'
    + '</div>'
    + '<div class="progress-section">'
    +   '<div class="progress-header">'
    +     '<span title="Share of your current balance that came from top-ups">Topped-up share</span>'
    +     '<span>' + (toppedUpShare < 0.1 ? '0' : toppedUpShare.toFixed(1)) + '%</span>'
    +   '</div>'
    +   '<div class="progress-bar"><div class="progress-fill ' + progressClass + '" id="progress-fill" style="width:0%"></div></div>'
    + '</div>'
    + '<button class="refresh-btn" id="refresh-btn">'
    +   '<span class="icon">🔄</span>'
    +   'Refresh'
    + '</button>'
    + '<div class="status-bar">'
    +   '<span class="status-dot"></span>'
    +   '<span id="status-text">Updated just now</span>'
    + '</div>';

  bindEvents();
  updateTimestamp();

  // Animate progress bar
  requestAnimationFrame(() => {
    const bar = document.getElementById('progress-fill');
    if (bar) bar.style.width = toppedUpShare + '%';
  });
}

function getSetupHTML(msg) {
  return ''
    + '<div style="text-align:center;padding:40px 20px;">'
    +   '<div style="font-size:64px;margin-bottom:16px;">🔑</div>'
    +   '<h2 style="font-size:16px;font-weight:600;margin-bottom:8px;">Set Up DeepSeek</h2>'
    +   '<p style="font-size:12px;color:var(--vscode-descriptionForeground);line-height:1.6;margin-bottom:16px;">'
    +     escapeHtml(msg)
    +   '</p>'
    +   '<p style="font-size:11px;color:var(--vscode-descriptionForeground);line-height:1.4;margin-bottom:20px;opacity:0.7;">'
    +     '🔒 Your key is stored in the system keychain (macOS Keychain / Windows Credential Manager), never in plain text.'
    +   '</p>'
    +   '<button class="setup-btn" id="setup-btn">Set API Key Securely</button>'
    + '</div>';
}

function bindEvents() {
  const mascotEl = document.getElementById('mascot');
  const refreshBtn = document.getElementById('refresh-btn');

  if (mascotEl) {
    mascotEl.addEventListener('click', () => {
      mascotEl.classList.add('spinning');
      setTimeout(() => mascotEl.classList.remove('spinning'), 600);
      doRefresh();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      refreshBtn.classList.add('refreshing');
      setTimeout(() => refreshBtn.classList.remove('refreshing'), 1000);
      doRefresh();
    });
  }
}

function bindSetupButton() {
  const btn = document.getElementById('setup-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      vscode.postMessage({ type: 'setApiKey' });
    });
  }
}

function doRefresh() {
  const amountEl = document.getElementById('balance-amount');
  if (amountEl) amountEl.classList.add('updating');
  vscode.postMessage({ type: 'refreshBalance' });
  setTimeout(() => {
    if (amountEl) amountEl.classList.remove('updating');
  }, 600);
}

function updateTimestamp() {
  const statusText = document.getElementById('status-text');
  if (!statusText) return;
  const now = new Date();
  const time = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  statusText.textContent = 'Updated at ' + time;
}

/**
 * @param {number} n
 * @returns {string}
 */
function formatNumber(n) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
