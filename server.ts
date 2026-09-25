import { createApp } from './services/app';

async function startServer() {
  const app = await createApp();
  const PORT = 3000;
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

// Export for Vercel
export default createApp;

// Start server if not in Vercel
if (!process.env.VERCEL) {
  startServer();
}
