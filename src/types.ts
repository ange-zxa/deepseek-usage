export interface DeepSeekBalance {
  isAvailable: boolean;
  currency: string;
  totalBalance: string;
  grantedBalance: string;
  toppedUpBalance: string;
}

// Last balance result, kept in the extension so it can be pushed to a webview
// that resolves (or reloads) after the fetch already finished.
export interface BalanceState {
  balance: DeepSeekBalance | null;
  error?: string;
}

// Messages sent from webview to extension
export type WebviewMessage =
  | { type: 'ready' }
  | { type: 'refreshBalance' }
  | { type: 'setApiKey' };

// Messages sent from extension to webview
export type ExtensionMessage =
  | { type: 'balanceUpdate'; balance: DeepSeekBalance | null; error?: string };
