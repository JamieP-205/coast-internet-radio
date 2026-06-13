Cloudflare Worker reference files only.

The live website already points to the deployed Workers in station-config.js:
- https://coast-stream.jamieparr05.workers.dev/stream
- https://coast-metadata.jamieparr05.workers.dev

Do not redeploy, rename, or delete those Workers unless you know exactly what you are doing. They are the workaround that lets the HTTPS website play the radio stream and read the now-playing information.
