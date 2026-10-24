import * as vscode from 'vscode';
import { BalanceViewProvider } from './balanceViewProvider';
import { fetchBalance } from './deepseekClient';
import { BalanceState, DeepSeekBalance } from './types';

const SECRET_KEY = 'deepseek-usage.apiKey';
// The extension used to be called "deepseek-chat", so old installs stored the
// key under that name. Migrate it on first read.
const LEGACY_SECRET_KEY = 'deepseek-chat.apiKey';
const REFRESH_INTERVAL_MS = 5 * 60_000;
// Refreshing on focus is cheap but should not hammer the API when the user
// alt-tabs repeatedly.
const FOCUS_REFRESH_THROTTLE_MS = 60_000;
const NO_API_KEY = 'No API key configured';

let statusBarItem: vscode.StatusBarItem;
let provider: BalanceViewProvider;
let context: vscode.ExtensionContext;
let lastState: BalanceState | undefined;
let refreshTimer: NodeJS.Timeout | undefined;
let refreshInFlight: Promise<void> | undefined;
let lastRefreshAt = 0;

async function getApiKey(): Promise<string> {
  const secret = await context.secrets.get(SECRET_KEY);
  if (secret) {
    return secret;
  }

  const legacy = await context.secrets.get(LEGACY_SECRET_KEY);
  if (!legacy) {
    return '';
  }

  await context.secrets.store(SECRET_KEY, legacy);
  await context.secrets.delete(LEGACY_SECRET_KEY);
  return legacy;
}

function updateStatusBar(balance: DeepSeekBalance | null, error?: string): void {
  if (!balance) {
    statusBarItem.backgroundColor = undefined;
    if (error === NO_API_KEY) {
      statusBarItem.text = '$(key) DeepSeek: Set API Key';
      statusBarItem.tooltip = 'Click to securely store your API key';
      statusBarItem.command = 'deepseek-usage.setApiKey';
    } else {
      statusBarItem.text = '$(circle-slash) DeepSeek: Error';
      statusBarItem.tooltip = `${error || 'Failed to fetch balance'}\nClick to retry`;
      statusBarItem.command = 'deepseek-usage.refreshBalance';
    }
    return;
  }

  statusBarItem.command = 'deepseek-usage.refreshBalance';

  if (!balance.isAvailable) {
    statusBarItem.text = '$(circle-slash) DeepSeek: --';
    statusBarItem.tooltip = 'Balance unavailable';
    statusBarItem.backgroundColor = undefined;
    return;
  }

  const total = parseFloat(balance.totalBalance);
  const icon = total < 10 ? '$(error)' : '$(dashboard)';
  statusBarItem.text = `${icon} DeepSeek: ${balance.totalBalance} ${balance.currency}`;
  statusBarItem.tooltip =
    `Granted: ${balance.grantedBalance} ${balance.currency} | Topped Up: ${balance.toppedUpBalance} ${balance.currency}\nClick to refresh`;
  statusBarItem.backgroundColor =
    total < 10
      ? new vscode.ThemeColor('statusBarItem.warningBackground')
      : undefined;
}

function applyBalance(balance: DeepSeekBalance | null, error?: string): void {
  lastState = { balance, error };
  provider.update(balance, error);
  updateStatusBar(balance, error);
}

/**
 * Fetch the balance once and broadcast it to the webview and the status bar.
 * Concurrent callers share the in-flight request, so a click, the timer, and
 * the webview's initial message can never produce duplicate API calls.
 */
function refreshBalance(): Promise<void> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    lastRefreshAt = Date.now();
    try {
      const apiKey = await getApiKey();
      if (!apiKey) {
        applyBalance(null, NO_API_KEY);
        return;
      }
      try {
        applyBalance(await fetchBalance(apiKey));
      } catch (err) {
        applyBalance(
          null,
          err instanceof Error ? err.message : 'Failed to fetch balance'
        );
      }
    } finally {
      refreshInFlight = undefined;
    }
  })();

  return refreshInFlight;
}

export function activate(ctx: vscode.ExtensionContext) {
  context = ctx;

  provider = new BalanceViewProvider(
    context,
    () => {
      void refreshBalance();
    },
    () => lastState
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      BalanceViewProvider.viewId,
      provider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  // Status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = 'deepseek-usage.refreshBalance';
  statusBarItem.name = 'DeepSeek Usage';
  context.subscriptions.push(statusBarItem);
  statusBarItem.show();

  // Single polling loop for both the webview and the status bar. It runs
  // regardless of whether the sidebar is hidden, so the status bar stays fresh.
  void refreshBalance();
  refreshTimer = setInterval(() => {
    void refreshBalance();
  }, REFRESH_INTERVAL_MS);

  // Refresh when the window regains focus so the balance is fresh when the
  // user comes back, without polling aggressively while it is in the background.
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      if (
        state.focused &&
        Date.now() - lastRefreshAt >= FOCUS_REFRESH_THROTTLE_MS
      ) {
        void refreshBalance();
      }
    })
  );

  // Command: refresh balance
  context.subscriptions.push(
    vscode.commands.registerCommand('deepseek-usage.refreshBalance', () =>
      refreshBalance()
    )
  );

  // Command: securely set API key
  context.subscriptions.push(
    vscode.commands.registerCommand('deepseek-usage.setApiKey', async () => {
      const existing = await getApiKey();
      const masked = existing
        ? existing.slice(0, 6) + '••••••••' + existing.slice(-4)
        : '';

      const newKey = await vscode.window.showInputBox({
        title: 'DeepSeek API Key',
        prompt: existing
          ? `Current key: ${masked}\nEnter new key to replace, or Esc to cancel`
          : 'Paste your DeepSeek API key. It will be securely stored in the system keychain.',
        password: true,
        placeHolder: 'sk-...',
        ignoreFocusOut: true,
        validateInput: (value) => {
          if (value && !value.startsWith('sk-')) {
            return 'API key should start with "sk-"';
          }
          return null;
        },
      });

      if (newKey !== undefined) {
        await context.secrets.store(SECRET_KEY, newKey.trim());
        vscode.window.showInformationMessage(
          'DeepSeek API key saved securely in system keychain.'
        );
        await refreshBalance();
      }
    })
  );
}

export function deactivate() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
}
