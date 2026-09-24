import express from 'express';
import { createAutonomaHandler } from '../services/autonomaIntegration';

const app = express();

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

const sharedSecret = process.env.AUTONOMA_SHARED_SECRET || 'e1ae84345a120f3f25ce10158da374307faadfeb1a091b997299ae55777d166a';
const signingSecret = process.env.AUTONOMA_SIGNING_SECRET || '043b60e656b726705d559a6489a73ccaf57c234f5e01b384f5f62936c1a0aaaa';
const autonomaHandler = createAutonomaHandler(sharedSecret, signingSecret);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/autonoma', (req, res) => {
  autonomaHandler(req, res);
});

export default app;