# Deployment Workflow

## Branch-to-URL Mapping
| Branch | Vercel Project | URL | Environment |
|--------|----------------|-----|-------------|
| `alpha` | `alpha` | `https://phssjamshoroportalalpha.vercel.app` | Testing only |
| `testing` | `peoples-school-lesson-planner` | `https://phssjamshoroportalb.vercel.app` | Partial public access |
| `main` | `peoples-school-lesson-planner` | `https://phssjamshoroportal.vercel.app` | Production for public |

## Deployment Process
1. **All changes are first pushed to `alpha` branch** for testing:
   - GitHub integration automatically deploys `alpha` branch → `phssjamshoroportalalpha.vercel.app`.
   - Vercel CLI can also be used for inspection, environment variable management, checking deployment logs (`vercel logs <url>`), or deploying previews directly via `vercel`.
2. **After alpha is verified**: changes are cherry-picked/merged to `testing` branch (`phssjamshoroportalb.vercel.app`).
3. **After testing is verified**: changes are merged to `main` branch (`phssjamshoroportal.vercel.app`).

## Vercel CLI Reference for this Workspace
The worktree is linked to project `alpha` (`prj_CB1WN8i8o6Z95dr9it2P4Sr9MUUq`).
- Check authenticated identity: `vercel whoami`
- List recent deployments: `vercel ls alpha`
- Inspect deployment logs: `vercel inspect <deployment-url>` or `vercel logs <deployment-url>`
- Environment variables: `vercel env ls`, `vercel env pull`, `vercel env add <NAME>`
- Direct preview build: `vercel` (builds and creates preview URL using `.vercel/project.json`)
- Production deployment: `vercel --prod` (only when promoting targeted releases)

