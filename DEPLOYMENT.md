# Deployment Workflow

## Branch-to-URL Mapping
| Branch | Vercel Project | URL | Environment |
|--------|----------------|-----|-------------|
| `alpha` | `alpha` | `https://phssjamshoroportalalpha.vercel.app` | Testing only |
| `testing` | `peoples-school-lesson-planner` | `https://phssjamshoroportalb.vercel.app` | Partial public access |
| `main` | `peoples-school-lesson-planner` | `https://phssjamshoroportal.vercel.app` | Production for public |

## Deployment Process
1. **All changes are first pushed to `alpha` branch** for testing
2. GitHub integration automatically deploys `alpha` branch → `phssjamshoroportalalpha.vercel.app`
3. **After alpha is verified**: changes are cherry-picked/merged to `testing` branch
4. GitHub integration automatically deploys `testing` branch → `phssjamshoroportalb.vercel.app`
5. **After testing is verified**: changes are merged to `main` branch
6. GitHub integration automatically deploys `main` branch → `phssjamshoroportal.vercel.app`

## Important Notes
- **Do NOT deploy directly via Vercel CLI** - use `git push origin <branch>` and let GitHub integration handle deployment
- Do NOT use `vercel --prod` or `vercel deploy` commands - this can create unwanted projects/deployments
- The "dist" project created by accidental `vercel deploy dist` should be ignored/deleted from Vercel dashboard
