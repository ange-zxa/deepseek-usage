import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionMessage, WebviewMessage } from './types';
import { fetchBalance } from './deepseekClient';

export class BalanceViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'deepseek-usage.balanceView';
  private _view?: vscode.WebviewView;
  private _context: vscode.ExtensionContext;
  private _onBalanceChanged: () => void;
  private _refreshInterval: NodeJS.Timeout | null = null;

  constructor(context: vscode.ExtensionContext, onBalanceChanged: () => void) {
    this._context = context;
    this._onBalanceChanged = onBalanceChanged;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this._context.extensionPath, 'media')),
      ],
    };

    webviewView.webview.html = this._getHtmlContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        switch (message.type) {
          case 'refreshBalance':
            await this._fetchAndSendBalance();
            break;
          case 'setApiKey':
            vscode.commands.executeCommand('deepseek-usage.setApiKey');
            break;
        }
      }
    );

    // Auto-refresh on visible
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this._fetchAndSendBalance();
        this._startAutoRefresh();
      } else {
        this._stopAutoRefresh();
      }
    });

    // Initial fetch + auto-refresh
    this._fetchAndSendBalance();
    this._startAutoRefresh();
  }

  public async refresh(): Promise<void> {
    await this._fetchAndSendBalance();
  }

  private _startAutoRefresh(): void {
    this._stopAutoRefresh();
    this._refreshInterval = setInterval(() => {
      this._fetchAndSendBalance();
    }, 30000);
  }

  private _stopAutoRefresh(): void {
    if (this._refreshInterval) {
      clearInterval(this._refreshInterval);
      this._refreshInterval = null;
    }
  }

  private async _getApiKey(): Promise<string> {
    const secretKey = await this._context.secrets.get('deepseek-chat.apiKey');
    return secretKey || '';
  }

  private async _fetchAndSendBalance(): Promise<void> {
    const apiKey = await this._getApiKey();
    if (!apiKey) {
      this._sendToWebview({
        type: 'balanceUpdate',
        balance: null,
        error: 'No API key configured',
      });
      return;
    }
    try {
      const balance = await fetchBalance(apiKey);
      this._sendToWebview({ type: 'balanceUpdate', balance });
    } catch (err) {
      this._sendToWebview({
        type: 'balanceUpdate',
        balance: null,
        error: err instanceof Error ? err.message : 'Failed to fetch balance',
      });
    }
    this._onBalanceChanged();
  }

  private _sendToWebview(message: ExtensionMessage): void {
    this._view?.webview.postMessage(message);
  }

  private _getHtmlContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this._context.extensionPath, 'media', 'balance.js')
      )
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' vscode-resource:; script-src 'unsafe-inline' vscode-resource:; img-src vscode-resource:;">
  <title>DeepSeek Balance</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      height: 100%;
      overflow: hidden;
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      color: var(--vscode-foreground);
      background: linear-gradient(180deg,
        var(--vscode-sideBar-background) 0%,
        color-mix(in srgb, var(--vscode-sideBar-background) 95%, var(--vscode-button-background)) 100%);
    }

    .dashboard {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 32px 20px;
      height: 100%;
      max-width: 400px;
      margin: 0 auto;
    }

    /* Mascot */
    .mascot {
      font-size: 56px;
      margin-bottom: 4px;
      animation: float 3s ease-in-out infinite;
      filter: drop-shadow(0 4px 12px rgba(0,0,0,0.15));
      cursor: pointer;
      user-select: none;
      transition: transform 0.2s;
    }
    .mascot:hover { transform: scale(1.1); }
    .mascot:active { transform: scale(0.95); }

    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-6px); }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .mascot.spinning { animation: spin 0.6s ease-in-out; }

    /* Greeting */
    .greeting {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 20px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      opacity: 0.7;
    }

    /* Total balance card */
    .balance-card {
      width: 100%;
      background: linear-gradient(135deg,
        color-mix(in srgb, var(--vscode-button-background) 30%, transparent) 0%,
        color-mix(in srgb, var(--vscode-button-background) 10%, transparent) 100%);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 20px;
      padding: 28px 24px;
      text-align: center;
      margin-bottom: 16px;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.08);
    }

    .balance-card::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle,
        color-mix(in srgb, var(--vscode-button-background) 15%, transparent) 0%,
        transparent 70%);
      animation: shimmer 4s ease-in-out infinite;
      pointer-events: none;
    }

    @keyframes shimmer {
      0%, 100% { transform: translate(0, 0); }
      50% { transform: translate(10px, -10px); }
    }

    .balance-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 8px;
      position: relative;
    }

    .balance-amount {
      font-size: 40px;
      font-weight: 700;
      letter-spacing: -1px;
      background: linear-gradient(135deg,
        var(--vscode-foreground) 0%,
        var(--vscode-button-background) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      position: relative;
      transition: all 0.5s ease;
    }

    .balance-amount.updating {
      opacity: 0.5;
      transform: scale(0.95);
    }

    .balance-currency {
      font-size: 16px;
      font-weight: 500;
      opacity: 0.6;
      position: relative;
    }

    /* Sub cards */
    .sub-cards {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      width: 100%;
      margin-bottom: 16px;
    }

    .sub-card {
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 14px;
      padding: 16px;
      text-align: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .sub-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.1);
    }

    .sub-card-icon {
      font-size: 22px;
      margin-bottom: 6px;
    }

    .sub-card-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }

    .sub-card-value {
      font-size: 18px;
      font-weight: 600;
    }

    /* Progress bar */
    .progress-section {
      width: 100%;
      margin-bottom: 20px;
    }

    .progress-header {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
      letter-spacing: 0.5px;
    }

    .progress-bar {
      height: 6px;
      background: var(--vscode-editor-background);
      border-radius: 3px;
      overflow: hidden;
      border: 1px solid var(--vscode-panel-border);
    }

    .progress-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 1s ease;
      background: linear-gradient(90deg,
        var(--vscode-button-background) 0%,
        color-mix(in srgb, var(--vscode-button-background) 70%, var(--vscode-foreground)) 100%);
    }

    .progress-fill.low {
      background: linear-gradient(90deg,
        var(--vscode-errorForeground) 0%,
        color-mix(in srgb, var(--vscode-errorForeground) 60%, orange) 100%);
    }

    /* Refresh button */
    .refresh-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 20px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 25px;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      letter-spacing: 0.5px;
      transition: all 0.3s;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .refresh-btn:hover {
      filter: brightness(1.1);
      box-shadow: 0 4px 16px rgba(0,0,0,0.2);
      transform: translateY(-1px);
    }

    .refresh-btn:active {
      transform: scale(0.97);
    }

    .refresh-btn .icon {
      display: inline-block;
      transition: transform 0.4s ease;
    }

    .refresh-btn.refreshing .icon {
      animation: spin 0.8s linear infinite;
    }

    .refreshing .icon { animation: spin 0.8s linear infinite; }

    /* Status dot */
    .status-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-top: 12px;
      opacity: 0.6;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #4ade80;
      animation: pulse 2s ease-in-out infinite;
    }

    .status-dot.error { background: var(--vscode-errorForeground); }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }

    /* Error state */
    .setup-card {
      width: 100%;
      background: var(--vscode-editor-background);
      border: 1px dashed var(--vscode-panel-border);
      border-radius: 20px;
      padding: 40px 24px;
      text-align: center;
    }

    .setup-card h2 {
      font-size: 16px;
      margin-bottom: 8px;
      font-weight: 600;
    }

    .setup-card p {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.6;
    }

    .setup-btn {
      display: inline-block;
      margin-top: 16px;
      padding: 8px 20px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
    }

    .setup-btn:hover { filter: brightness(1.1); }
  </style>
</head>
<body>
  <div class="dashboard" id="dashboard">
    <!-- Will be populated by JS -->
  </div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
