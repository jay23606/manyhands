import { readdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function walk(dir) {
  let out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = dir + "/" + e.name;
    if (e.isDirectory()) out.push(...(await walk(path)));
    else if (!e.name.endsWith(".map") && e.name !== "sw.js") out.push(path);
  }
  return out;
}
const files = await walk("dist");
const hash = createHash("sha256");
for (const f of files) hash.update(await readFile(f));
const name = "manyhands-" + hash.digest("hex").slice(0, 12);
const assets = files.map((p) => "./" + p.slice(5));
await writeFile(
  "dist/sw.js",
  `const CACHE=${JSON.stringify(name)};const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS))));
self.addEventListener('message',e=>{if(e.data==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('manyhands-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||!u.pathname.startsWith(new URL(self.registration.scope).pathname))return;
 if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.match(new URL('index.html',self.registration.scope))));return;}
 e.respondWith(caches.open(CACHE).then(c=>c.match(e.request,{ignoreVary:true})).then(cached=>cached||fetch(e.request)));
});`,
);
console.log("Offline shell: " + files.length + " assets, " + name);
