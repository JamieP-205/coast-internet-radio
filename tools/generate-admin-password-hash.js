const crypto = require("crypto");

const password = process.argv[2];
if (!password || password.length < 14) {
  console.error("Usage: node tools/generate-admin-password-hash.js \"new long password\"");
  process.exit(1);
}
const N = 16384, r = 8, p = 1;
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64, { N, r, p, maxmem: 64 * 1024 * 1024 });
function b64u(buf) { return Buffer.from(buf).toString("base64url"); }
console.log(`scrypt$${N}$${r}$${p}$${b64u(salt)}$${b64u(hash)}`);
