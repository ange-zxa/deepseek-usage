import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BalanceApiError,
  describeHttpError,
  parseBalanceResponse,
} from '../deepseekClient';

test('parses a valid balance response', () => {
  const body = JSON.stringify({
    is_available: true,
    balance_infos: [
      {
        currency: 'CNY',
        total_balance: '110.00',
        granted_balance: '10.00',
        topped_up_balance: '100.00',
      },
    ],
  });

  assert.deepEqual(parseBalanceResponse(200, body), {
    isAvailable: true,
    currency: 'CNY',
    totalBalance: '110.00',
    grantedBalance: '10.00',
    toppedUpBalance: '100.00',
  });
});

test('falls back to defaults when balance_infos is missing', () => {
  assert.deepEqual(
    parseBalanceResponse(200, JSON.stringify({ is_available: true })),
    {
      isAvailable: true,
      currency: 'CNY',
      totalBalance: '0',
      grantedBalance: '0',
      toppedUpBalance: '0',
    }
  );
});

test('returns null when the account is unavailable', () => {
  assert.equal(
    parseBalanceResponse(200, JSON.stringify({ is_available: false })),
    null
  );
});

test('returns null for a non-object body', () => {
  assert.equal(parseBalanceResponse(200, 'null'), null);
});

test('throws a typed error for an invalid API key', () => {
  assert.throws(
    () => parseBalanceResponse(401, '{"error":{"message":"bad key"}}'),
    (err: unknown) =>
      err instanceof BalanceApiError &&
      err.statusCode === 401 &&
      /invalid or expired/.test(err.message)
  );
});

test('explains rate limiting and server errors', () => {
  assert.match(describeHttpError(429, ''), /Rate limited/);
  assert.match(describeHttpError(503, ''), /HTTP 503/);
});

test('includes the API error detail when present', () => {
  assert.match(
    describeHttpError(400, '{"error":{"message":"invalid parameter"}}'),
    /invalid parameter/
  );
});

test('throws when the response body is not JSON', () => {
  assert.throws(
    () => parseBalanceResponse(200, '<html>not json</html>'),
    BalanceApiError
  );
});
