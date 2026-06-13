# Contributing

Coast Internet Radio is a production website. Keep changes focused, accessible, and compatible with the existing Netlify and Cloudflare deployment.

1. Create a branch from `main`.
2. Install dependencies with `npm ci`.
3. Make the smallest change that solves the issue.
4. Run `npm run check`.
5. Describe user-facing behaviour and deployment changes in the pull request.

Never commit credentials, listener data, admin exports, or private station information. Changes to stream or Worker URLs require coordinated production testing.
