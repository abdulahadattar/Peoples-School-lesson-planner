import { Router } from 'express';
import crypto from 'crypto';
import { createAutonomaHandler } from '../autonomaIntegration.js';

export function createAutonomaRouter(): Router {
  const router = Router();

  function missingAutonomaSecrets(sharedSecret: string, signingSecret: string): string[] {
    const missing: string[] = [];
    if (!sharedSecret) missing.push('AUTONOMA_SHARED_SECRET');
    if (!signingSecret) missing.push('AUTONOMA_SIGNING_SECRET');
    return missing;
  }

  function generateDevAutonomaSecrets(): { sharedSecret: string; signingSecret: string } {
    const sharedSecret = crypto.randomBytes(32).toString('hex');
    let signingSecret = crypto.randomBytes(32).toString('hex');
    while (signingSecret === sharedSecret) {
      signingSecret = crypto.randomBytes(32).toString('hex');
    }
    return { sharedSecret, signingSecret };
  }

  function resolveAutonomaSecrets(): { sharedSecret: string; signingSecret: string } {
    const sharedSecret = (process.env.AUTONOMA_SHARED_SECRET || '').trim();
    const signingSecret = (process.env.AUTONOMA_SIGNING_SECRET || '').trim();

    if (sharedSecret && sharedSecret === signingSecret) {
      const message =
        '[autonoma] AUTONOMA_SHARED_SECRET and AUTONOMA_SIGNING_SECRET must be different: ' +
        '@autonoma-ai/sdk rejects identical secrets with SAME_SECRETS.';
      console.warn(`${message} Using a generated fallback pair for this boot.`);
      return generateDevAutonomaSecrets();
    }

    const missing = missingAutonomaSecrets(sharedSecret, signingSecret);
    if (missing.length > 0) {
      const message =
        `[autonoma] Missing environment variable(s): ${missing.join(', ')}. ` +
        'Set them in project settings or .env if Autonoma integration is needed. ' +
        'An empty or stale value answers every signed request with 401 INVALID_SIGNATURE.';
      console.warn(`${message} Continuing with a generated fallback secret pair.`);
      return generateDevAutonomaSecrets();
    }

    return { sharedSecret, signingSecret };
  }

  const { sharedSecret: AUTONOMA_SHARED_SECRET, signingSecret: AUTONOMA_SIGNING_SECRET } =
    resolveAutonomaSecrets();
  const autonomaHandler = createAutonomaHandler(AUTONOMA_SHARED_SECRET, AUTONOMA_SIGNING_SECRET);

  router.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  router.post('/autonoma', (req, res) => {
    autonomaHandler(req, res);
  });

  router.post('/test-post', (req, res) => {
    res.json({ ok: true, body: req.body });
  });

  router.get('/test-route', (_req, res) => {
    res.json({ ok: true });
  });

  return router;
}
