export interface DeepSeekBalance {
  isAvailable: boolean;
  currency: string;
  totalBalance: string;
  grantedBalance: string;
  toppedUpBalance: string;
}

// Messages sent from webview to extension
export type WebviewMessage =
  | { type: 'refreshBalance' }
  | { type: 'setApiKey' };

// Messages sent from extension to webview
export type ExtensionMessage =
  | { type: 'balanceUpdate'; balance: DeepSeekBalance | null; error?: string };
