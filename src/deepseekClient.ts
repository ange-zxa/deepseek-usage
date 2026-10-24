import * as https from 'https';
import { DeepSeekBalance } from './types';

const API_BASE = 'api.deepseek.com';
const API_TIMEOUT_MS = 10_000;

export class BalanceApiError extends Error {
  constructor(message: string, public readonly statusCode?: number) {
    super(message);
    this.name = 'BalanceApiError';
  }
}

function toBalanceError(err: unknown): BalanceApiError {
  if (err instanceof BalanceApiError) {
    return err;
  }
  if (err instanceof Error) {
    return new BalanceApiError(`Network error: ${err.message}`);
  }
  return new BalanceApiError('Network error');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function extractErrorMessage(body: string): string | undefined {
  try {
    const parsed = asRecord(JSON.parse(body));
    const error = asRecord(parsed?.error);
    const message = error?.message ?? parsed?.message;
    return typeof message === 'string' && message.trim()
      ? message.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

export function describeHttpError(statusCode: number, body: string): string {
  if (statusCode === 401 || statusCode === 403) {
    return 'API key is invalid or expired. Set a new key with "DeepSeek: Set API Key".';
  }
  if (statusCode === 429) {
    return 'Rate limited by the DeepSeek API. Try again in a moment.';
  }
  if (statusCode >= 500) {
    return `DeepSeek API error (HTTP ${statusCode}). Try again later.`;
  }
  const detail = extractErrorMessage(body);
  return detail
    ? `Request failed (HTTP ${statusCode}): ${detail}`
    : `Request failed (HTTP ${statusCode})`;
}

/**
 * Turn a `/user/balance` response into a value, or throw a BalanceApiError for
 * non-2xx / malformed responses. Returns null when the account is unavailable.
 * Pure so it can be unit tested without network access.
 */
export function parseBalanceResponse(
  statusCode: number,
  body: string
): DeepSeekBalance | null {
  if (statusCode < 200 || statusCode >= 300) {
    throw new BalanceApiError(describeHttpError(statusCode, body), statusCode);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new BalanceApiError('Failed to parse balance response');
  }

  const record = asRecord(parsed);
  if (!record || !record.is_available) {
    return null;
  }

  const infos = Array.isArray(record.balance_infos)
    ? record.balance_infos
    : [];
  const info = asRecord(infos[0]) ?? {};
  const text = (value: unknown, fallback: string): string =>
    typeof value === 'string' && value ? value : fallback;

  return {
    isAvailable: true,
    currency: text(info.currency, 'CNY'),
    totalBalance: text(info.total_balance, '0'),
    grantedBalance: text(info.granted_balance, '0'),
    toppedUpBalance: text(info.topped_up_balance, '0'),
  };
}

export function fetchBalance(apiKey: string): Promise<DeepSeekBalance | null> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const settle = (action: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      action();
    };

    const req = https.request(
      {
        hostname: API_BASE,
        path: '/user/balance',
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('error', (err: Error) => settle(() => reject(toBalanceError(err))));
        res.on('end', () => {
          settle(() => {
            try {
              resolve(parseBalanceResponse(res.statusCode ?? 0, data));
            } catch (err) {
              reject(toBalanceError(err));
            }
          });
        });
      }
    );

    const timeout = setTimeout(() => {
      req.destroy(
        new BalanceApiError(`Request timed out after ${API_TIMEOUT_MS / 1000}s`)
      );
    }, API_TIMEOUT_MS);

    req.on('error', (err: Error) => settle(() => reject(toBalanceError(err))));
    req.end();
  });
}
