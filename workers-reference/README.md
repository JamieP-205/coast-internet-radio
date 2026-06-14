# Cloudflare Worker References

I use two Cloudflare Workers to connect the HTTPS website to Coast Internet Radio's existing stream and metadata sources:

- `cloudflare-worker-stream-proxy.js` - proxies the live audio stream
- `cloudflare-worker-metadata-proxy.js` - reads and normalises now-playing metadata

The deployed Worker routes are configured in `station-config.js`. I treat those URLs as production interfaces: any Worker change must preserve the route contract and be tested against the live player before deployment.

If metadata fails, I test the metadata Worker independently before changing the website. If audio fails, I check the stream Worker and upstream stream separately. This keeps unrelated fixes away from the working part of the service.
