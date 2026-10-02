# Deployment Workflow

## Branch-to-URL Mapping
All branches deploy under the unified Vercel project **`peoples-school-lesson-planner`** (`prj_F0luiaaZGoT4TEXghVAKyN1XLu6R`):

| Branch | Dedicated Domain / Alias | Environment | Purpose |
|--------|--------------------------|-------------|---------|
| `alpha` | `https://phssjamshoroportalalpha.vercel.app` | Preview | Active feature development & rapid testing |
| `testing` | `https://phssjamshoroportalb.vercel.app` | Preview | Staging / partial public access verification |
| `main` | `https://phssjamshoroportal.vercel.app` | Production | Live production for teachers & students |

## Deployment Process
1. **Develop and verify locally first**:
   - Run type checks, production builds, and headless UI tests: `npm run validate`
2. **Push to `alpha` branch**:
   - `git push origin alpha`
   - Vercel automatically builds and deploys to the dedicated domain: `https://phssjamshoroportalalpha.vercel.app`.
3. **Verify the deployed preview**:
   - Inspect build status and live deployment: `vercel ls` or `vercel inspect https://phssjamshoroportalalpha.vercel.app`
4. **Promote changes**:
   - After verification on alpha, merge/cherry-pick to `testing` (`phssjamshoroportalb.vercel.app`).
   - After testing verification, merge to `main` (`phssjamshoroportal.vercel.app`).

## Vercel CLI Reference for this Workspace
The worktree is linked to project **`peoples-school-lesson-planner`** (`prj_F0luiaaZGoT4TEXghVAKyN1XLu6R`).
- Check authenticated identity: `vercel whoami`
- List recent deployments: `vercel ls`
- Inspect deployment logs: `vercel inspect <deployment-url>` or `vercel logs <deployment-url>`
- Pull environment variables: `vercel env pull .env.local`
- Manual CLI preview: `vercel`

