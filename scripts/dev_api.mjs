// Local stand-in for the Cloudflare Worker: node scripts/dev_api.mjs  ->  http://localhost:8787
import { createServer } from "node:http";
import worker from "../worker/api.mjs";
createServer(async (req, res) => {
  const r = await worker.fetch(new Request("http://localhost:8787" + req.url, { method: req.method, headers: req.headers }));
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(8787, () => console.log("dev api on :8787"));
