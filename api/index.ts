import { createApp } from '../services/app';
import { Express } from 'express';

let cachedApp: Express | null = null;

export default async function(req: any, res: any) {
  if (!cachedApp) {
    cachedApp = await createApp();
  }
  cachedApp(req, res);
}
