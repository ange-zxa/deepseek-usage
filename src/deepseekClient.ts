import * as https from 'https';
import * as http from 'http';
import { DeepSeekBalance } from './types';

const API_BASE = 'api.deepseek.com';

export function fetchBalance(apiKey: string): Promise<DeepSeekBalance | null> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_BASE,
      path: '/user/balance',
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    };

    const req = https.request(options, (res: http.IncomingMessage) => {
      let data = '';
      res.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (!parsed.is_available) {
            resolve(null);
            return;
          }
          const info = parsed.balance_infos?.[0];
          resolve({
            isAvailable: parsed.is_available,
            currency: info?.currency || 'CNY',
            totalBalance: info?.total_balance || '0',
            grantedBalance: info?.granted_balance || '0',
            toppedUpBalance: info?.topped_up_balance || '0',
          });
        } catch {
          reject(new Error('Failed to parse balance response'));
        }
      });
      res.on('error', (err: Error) => reject(err));
    });

    req.on('error', (err: Error) => reject(err));
    req.end();
  });
}
