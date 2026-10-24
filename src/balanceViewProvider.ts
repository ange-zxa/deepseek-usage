import * as vscode from 'vscode';
import * as path from 'path';
import { BalanceState, ExtensionMessage, WebviewMessage } from './types';

export class BalanceViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'deepseek-usage.balanceView';
  private _view?: vscode.WebviewView;
  private readonly _context: vscode.ExtensionContext;
  private readonly _onRefreshRequested: () => void;
  private readonly _getLastState: () => BalanceState | undefined;

  constructor(
    context: vscode.ExtensionContext,
    onRefreshRequested: () => void,
    getLastState: () => BalanceState | undefined
  ) {
    this._context = context;
    this._onRefreshRequested = onRefreshRequested;
    this._getLastState = getLastState;
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

    webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
      switch (message.type) {
        case 'ready': {
          // The webview script has loaded and can receive messages now.
          const state = this._getLastState();
          if (state) {
            this.update(state.balance, state.error, state.noApiKey);
          } else {
            this._onRefreshRequested();
          }
          break;
        }
        case 'refreshBalance':
          this._onRefreshRequested();
          break;
        case 'setApiKey':
          vscode.commands.executeCommand('deepseek-usage.setApiKey');
          break;
      }
    });
  }

  /** Push the latest balance (or error) into the webview. */
  public update(
    balance: BalanceState['balance'],
    error?: string,
    noApiKey?: boolean
  ): void {
    this._sendToWebview({ type: 'balanceUpdate', balance, error, noApiKey });
  }

  private _sendToWebview(message: ExtensionMessage): void {
    this._view?.webview.postMessage(message);
  }

  private _whaleUri(webview: vscode.Webview, file: string): string {
    return webview
      .asWebviewUri(
        vscode.Uri.file(
          path.join(this._context.extensionPath, 'media', 'whale', file)
        )
      )
      .toString();
  }

  private _getHtmlContent(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(
        path.join(this._context.extensionPath, 'media', 'balance.js')
      )
    );

    const whale = (file: string): string => this._whaleUri(webview, file);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${webview.cspSource}; script-src ${webview.cspSource}; img-src ${webview.cspSource} data:;">
  <title>DeepSeek Balance</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      height: 100%;
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      color: var(--vscode-foreground);
      background: linear-gradient(180deg,
        var(--vscode-sideBar-background) 0%,
        color-mix(in srgb, var(--vscode-sideBar-background) 94%, #3b6fd8) 100%);
    }
    body { overflow-x: hidden; overflow-y: auto; }

    .dashboard {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 18px 16px 24px;
      min-height: 100%;
      max-width: 400px;
      margin: 0 auto;
    }

    /* Whale mascot */
    .mascot-scene {
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      margin-bottom: 14px;
      animation: scene-in 0.35s ease-out;
    }

    @keyframes scene-in {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .speech {
      position: relative;
      max-width: 250px;
      padding: 8px 13px;
      margin-bottom: 13px;
      border-radius: 14px;
      font-size: 12px;
      line-height: 1.45;
      text-align: center;
      color: var(--vscode-foreground);
      background: color-mix(in srgb, var(--vscode-editor-background) 88%, #c7dcff);
      border: 1.5px solid color-mix(in srgb, #3b6fd8 40%, var(--vscode-panel-border));
      box-shadow: 3px 3px 0 color-mix(in srgb, #3b6fd8 13%, transparent);
    }

    .speech::after {
      content: '';
      position: absolute;
      bottom: -6.5px;
      left: 50%;
      width: 11px;
      height: 11px;
      transform: translateX(-50%) rotate(45deg);
      background: inherit;
      border-right: 1.5px solid color-mix(in srgb, #3b6fd8 40%, var(--vscode-panel-border));
      border-bottom: 1.5px solid color-mix(in srgb, #3b6fd8 40%, var(--vscode-panel-border));
    }

    .mascot-wrap {
      position: relative;
      display: grid;
      place-items: center;
      animation: bob 4s ease-in-out infinite;
    }

    .mascot-wrap.thinking { animation: think 1.8s ease-in-out infinite; }

    @keyframes bob {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-5px); }
    }

    @keyframes think {
      0%, 100% { transform: rotate(-1.2deg); }
      50% { transform: rotate(1.2deg); }
    }

    .mascot-wrap::before {
      content: '';
      position: absolute;
      width: 150px;
      height: 150px;
      border-radius: 50%;
      background: radial-gradient(circle,
        color-mix(in srgb, #5b8def 26%, transparent) 0%,
        transparent 70%);
      filter: blur(4px);
      pointer-events: none;
    }

    .mascot {
      position: relative;
      width: 132px;
      height: 132px;
      object-fit: contain;
      cursor: pointer;
      user-select: none;
      -webkit-user-drag: none;
      filter: drop-shadow(0 10px 18px rgba(20, 40, 90, 0.22));
      transition: transform 0.2s ease;
    }

    .mascot:hover { transform: scale(1.05); }
    .mascot:active { transform: scale(0.97); }

    /* Total balance card */
    .balance-card {
      width: 100%;
      background: linear-gradient(135deg,
        color-mix(in srgb, #3b6fd8 20%, transparent) 0%,
        color-mix(in srgb, var(--vscode-button-background) 8%, transparent) 100%);
      border: 1px solid color-mix(in srgb, #3b6fd8 26%, var(--vscode-panel-border));
      border-radius: 18px;
      padding: 22px 20px;
      text-align: center;
      margin-bottom: 14px;
      position: relative;
      overflow: hidden;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(20, 40, 90, 0.10);
    }

    .balance-card::before {
      content: '';
      position: absolute;
      top: -50%;
      left: -50%;
      width: 200%;
      height: 200%;
      background: radial-gradient(circle,
        color-mix(in srgb, #6f9bff 14%, transparent) 0%,
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
      font-size: 38px;
      font-weight: 700;
      letter-spacing: -1px;
      background: linear-gradient(135deg,
        var(--vscode-foreground) 10%,
        #4f86e8 100%);
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
      font-size: 15px;
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
      margin-bottom: 14px;
    }

    .sub-card {
      background: color-mix(in srgb, var(--vscode-editor-background) 92%, #3b6fd8);
      border: 1px solid color-mix(in srgb, #3b6fd8 18%, var(--vscode-panel-border));
      border-radius: 14px;
      padding: 15px;
      text-align: center;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .sub-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(20, 40, 90, 0.12);
    }

    .sub-card-icon { font-size: 21px; margin-bottom: 6px; }
    .sub-card-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 4px;
    }
    .sub-card-value { font-size: 18px; font-weight: 600; }

    /* Progress bar */
    .progress-section { width: 100%; margin-bottom: 18px; }

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
      background: linear-gradient(90deg, #3b6fd8 0%, #8ab6ff 100%);
    }

    .progress-fill.low {
      background: linear-gradient(90deg,
        var(--vscode-errorForeground) 0%,
        color-mix(in srgb, var(--vscode-errorForeground) 60%, orange) 100%);
    }

    /* Buttons */
    .refresh-btn {
      display: inline-flex;
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
      box-shadow: 0 2px 8px rgba(20, 40, 90, 0.12);
    }

    .refresh-btn:hover {
      filter: brightness(1.1);
      box-shadow: 0 4px 16px rgba(20, 40, 90, 0.20);
      transform: translateY(-1px);
    }

    .refresh-btn:active { transform: scale(0.97); }

    .refresh-btn .icon {
      display: inline-block;
      transition: transform 0.4s ease;
    }

    .refresh-btn.refreshing .icon { animation: spin 0.8s linear infinite; }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .btn-secondary {
      padding: 8px 16px;
      background: transparent;
      color: var(--vscode-foreground);
      border: 1px solid var(--vscode-panel-border);
      border-radius: 25px;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      transition: all 0.2s;
    }

    .btn-secondary:hover {
      background: var(--vscode-toolbar-hoverBackground);
    }

    /* Status line */
    .status-bar {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 10px;
      color: var(--vscode-descriptionForeground);
      margin-top: 12px;
      opacity: 0.7;
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

    /* Setup / error states */
    .setup-card,
    .error-card {
      width: 100%;
      background: var(--vscode-editor-background);
      border: 1px dashed var(--vscode-panel-border);
      border-radius: 18px;
      padding: 22px 18px;
      text-align: center;
    }

    .error-card {
      border-color: color-mix(in srgb,
        var(--vscode-errorForeground) 40%, var(--vscode-panel-border));
    }

    .setup-card h2,
    .error-card h2 {
      font-size: 15px;
      margin-bottom: 8px;
      font-weight: 600;
    }

    .setup-card p,
    .error-card p {
      font-size: 12px;
      color: var(--vscode-descriptionForeground);
      line-height: 1.6;
    }

    .setup-note {
      margin-top: 14px;
      font-size: 10px;
      opacity: 0.75;
    }

    .setup-btn {
      display: inline-block;
      margin-top: 14px;
      padding: 8px 20px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 20px;
      cursor: pointer;
      font-family: inherit;
      font-size: 12px;
      font-weight: 500;
      transition: filter 0.2s;
    }

    .setup-btn:hover { filter: brightness(1.1); }

    .error-detail { margin-bottom: 14px; word-break: break-word; }

    .action-row {
      display: flex;
      gap: 8px;
      justify-content: center;
      flex-wrap: wrap;
    }

    @media (max-width: 260px) {
      .mascot { width: 108px; height: 108px; }
      .mascot-wrap::before { width: 124px; height: 124px; }
      .balance-amount { font-size: 32px; }
    }
  </style>
</head>
<body
  data-whale-normal="${whale('normal.webp')}"
  data-whale-surprised="${whale('surprised.webp')}"
  data-whale-sleepy="${whale('sleepy.webp')}"
  data-whale-happy="${whale('happy.webp')}"
  data-whale-thinking="${whale('thinking.webp')}">
  <div class="dashboard" id="dashboard">
    <!-- Will be populated by JS -->
  </div>
  <script src="${scriptUri}"></script>
</body>
</html>`;
  }
}
