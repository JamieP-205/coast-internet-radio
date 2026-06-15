# Deployment Workflow

- Repository: `JamieP-205/coast-internet-radio`
- Production branch: `main`
- Netlify site: `coastinternetradio`
- Production URL: `https://coastinternetradio.com`
- Base directory: repository root
- Build command: `npm run build`
- Publish directory: `.`
- Functions directory: `netlify/functions`

GitHub is the source of truth. Pull requests and non-production branches use deploy previews;
pushes to `main` deploy to the existing production site.

Before pushing, run `npm ci` and `npm test`. Environment variables, admin credentials, Blob
tokens, production data and local `.env` files remain in Netlify or local storage and must never
be committed.
