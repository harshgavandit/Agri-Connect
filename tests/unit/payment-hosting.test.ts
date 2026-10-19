import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

async function intercepts(path: string, method = "GET", mode = "navigate") {
  const listeners = new Map<string, (event: any) => void>();
  let intercepted = false;
  const source = await readFile(new URL("../../frontend/public/service-worker.js", import.meta.url), "utf8");
  runInNewContext(source, {
    URL, Response,
    self: { location: { origin: "https://marketplace.example" }, addEventListener: (name: string, handler: (event: any) => void) => listeners.set(name, handler) },
    fetch: async () => new Response("test asset"),
    caches: { match: async () => undefined, open: async () => ({ put: async () => undefined }) },
  });
  listeners.get("fetch")!({ request: { url: "https://marketplace.example" + path, method, mode }, respondWith: () => { intercepted = true; } });
  return intercepted;
}

test("payment and checkout navigations bypass the offline worker instead of receiving its synthetic 503 or cached shell", async () => {
  for (const path of ["/checkout", "/checkout/payment/test-quote", "/payment/test-attempt/processing", "/payment/success", "/payment/failed"]) {
    assert.equal(await intercepts(path), false, path);
  }
});

test("the offline worker never intercepts payment APIs or mutations", async () => {
  assert.equal(await intercepts("/api/payments/methods", "GET", "cors"), false);
  assert.equal(await intercepts("/api/checkout/intents", "POST", "cors"), false);
});

test("public home navigation and versioned static assets retain offline support", async () => {
  assert.equal(await intercepts("/"), true);
  assert.equal(await intercepts("/assets/app-example.js", "GET", "cors"), true);
});
