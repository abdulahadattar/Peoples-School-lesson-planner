# Deployment Workflow

All branches auto-deploy via GitHub integration under Vercel project `peoples-school-lesson-planner`:

| Branch | URL | Purpose |
| :--- | :--- | :--- |
| `alpha` | `https://phssjamshoroportalalpha.vercel.app` | Active feature testing |
| `testing` | `https://phssjamshoroportalb.vercel.app` | Staging / partial public |
| `main` | `https://phssjamshoroportal.vercel.app` | Production |

1. Verify locally: `npm run lint && npm run build && npm run test:unit`
2. Push branch (`git push origin <branch>`); **never run `vercel --prod`**.
3. Inspect with `vercel ls` or `vercel inspect <url>` if needed.
