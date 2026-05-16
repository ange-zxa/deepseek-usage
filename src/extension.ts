import * as vscode from 'vscode';
import { BalanceViewProvider } from './balanceViewProvider';
import { fetchBalance } from './deepseekClient';

const SECRET_KEY = 'deepseek-chat.apiKey';
let statusBarItem: vscode.StatusBarItem;
let context: vscode.ExtensionContext;

async function getApiKey(): Promise<string> {
  const secret = await context.secrets.get(SECRET_KEY);
  return secret || '';
}

async function refreshBalance() {
  const apiKey = await getApiKey();
  if (!apiKey) {
    statusBarItem.text = '$(key) DeepSeek: Set API Key';
    statusBarItem.tooltip = 'Click to securely store your API key';
    statusBarItem.command = 'deepseek-chat.setApiKey';
    statusBarItem.backgroundColor = undefined;
    return;
  }
  try {
    const balance = await fetchBalance(apiKey);
    if (!balance || !balance.isAvailable) {
      statusBarItem.text = '$(circle-slash) DeepSeek: --';
      statusBarItem.tooltip = 'Balance unavailable';
    } else {
      const total = parseFloat(balance.totalBalance);
      const icon = total < 10 ? '$(error)' : '$(dashboard)';
      statusBarItem.text = `${icon} DeepSeek: ${balance.totalBalance} ${balance.currency}`;
      statusBarItem.tooltip =
        `Granted: ${balance.grantedBalance} ${balance.currency} | Topped Up: ${balance.toppedUpBalance} ${balance.currency}\nClick to refresh`;
      if (total < 10) {
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      } else {
        statusBarItem.backgroundColor = undefined;
      }
    }
  } catch {
    statusBarItem.text = '$(circle-slash) DeepSeek: Error';
    statusBarItem.tooltip = 'Failed to fetch balance. Click to retry.';
  }
}

export function activate(ctx: vscode.ExtensionContext) {
  context = ctx;

  const provider = new BalanceViewProvider(context, () => refreshBalance());

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
  statusBarItem.command = 'deepseek-chat.refreshBalance';
  statusBarItem.name = 'DeepSeek Balance';
  context.subscriptions.push(statusBarItem);
  statusBarItem.show();
  refreshBalance();

  // Command: refresh balance
  context.subscriptions.push(
    vscode.commands.registerCommand('deepseek-chat.refreshBalance', () =>
      refreshBalance()
    )
  );

  // Command: securely set API key
  context.subscriptions.push(
    vscode.commands.registerCommand('deepseek-chat.setApiKey', async () => {
      const existing = await context.secrets.get(SECRET_KEY);
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
        await context.secrets.store(SECRET_KEY, newKey);
        vscode.window.showInformationMessage(
          'DeepSeek API key saved securely in system keychain.'
        );
        await refreshBalance();
        await provider.refresh();
      }
    })
  );
}

export function deactivate() {}
