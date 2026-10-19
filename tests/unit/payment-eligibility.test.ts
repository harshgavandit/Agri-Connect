import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import express from "express";
import type { Server } from "node:http";

process.env.DATABASE_URL = "postgresql://synthetic:synthetic@127.0.0.1:1/payment_test";
process.env.NODE_ENV = "production";
process.env.PAYMENTS_MODE = "sandbox";
process.env.PAYMENTS_ENABLED_PROVIDERS = "stripe,razorpay";
const { eligibilityService } = await import("../../backend/payments/eligibility-service");
const { paymentRuntimeConfig } = await import("../../backend/payments/config");
const { paymentOperationsRepository } = await import("../../backend/repositories/payment-operations-repository");
const { paymentRepository } = await import("../../backend/repositories/payment-repository");
const { checkoutRepository } = await import("../../backend/repositories/checkout-repository");
const { authStorage } = await import("../../backend/auth/storage");
const { registerPaymentRoutes } = await import("../../backend/modules/payments/routes");
const realFetch = globalThis.fetch;
let server: Server | undefined;
let quoteReads = 0;
const quoteId = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
  process.env.NODE_ENV = "production";
  process.env.STRIPE_PRIVATE_KEY = "sk_test_synthetic_not_a_real_key";
  delete process.env.STRIPE_SECRET_KEY;
  process.env.RAZORPAY_KEY_ID = "rzp_test_synthetic";
  process.env.RAZORPAY_KEY_SECRET = "synthetic_not_a_real_secret";
  delete process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_SECRET;
  Object.assign(paymentRuntimeConfig, { mode: "sandbox", requestedProviders: ["stripe", "razorpay"], mvpModeEnabled: true, uiPreviewEnabled: false });
  mock.method(paymentOperationsRepository, "getProviderConfig", async () => undefined);
  mock.method(paymentOperationsRepository, "getSellerPaymentAccounts", async () => []);
  mock.method(authStorage, "getUser", async () => ({ id: "synthetic-buyer", accountStatus: "active" }));
  mock.method(paymentRepository, "getQuote", async () => {
    quoteReads++;
    return { id: quoteId, buyerId: "synthetic-buyer", currency: "INR", expiresAt: new Date(Date.now() + 60_000), quoteData: { sellerIds: ["synthetic-seller"] } };
  });
  mock.method(checkoutRepository, "getQuoteUsage", async () => undefined);
  quoteReads = 0;
  mock.method(globalThis, "fetch", async (input: any, init?: any) => {
    const url = new URL(typeof input === "string" ? input : input.url ?? input.toString());
    if (url.hostname === "127.0.0.1") return realFetch(input, init);
    throw new Error("Unit tests prohibit external provider requests");
  });
});

afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
  server = undefined;
  mock.restoreAll();
});

test("configured Stripe and Razorpay test providers are eligible on a production Node runtime", async () => {
  assert.equal((await eligibilityService.evaluate("stripe", "INR", ["synthetic-seller"], 1)).eligible, true);
  assert.equal((await eligibilityService.evaluate("stripe", "GBP", ["synthetic-seller"], 1)).eligible, true);
  assert.equal((await eligibilityService.evaluate("razorpay", "INR", ["synthetic-seller"], 1)).eligible, true);
});

test("Razorpay stays unavailable for GBP rather than creating a mismatched INR order", async () => {
  const result = await eligibilityService.evaluate("razorpay", "GBP", ["synthetic-seller"], 1);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("razorpay_inr_only"));
});

test("PayPal remains disabled without credentials or environment activation", async () => {
  const result = await eligibilityService.evaluate("paypal", "INR", ["synthetic-seller"], 1);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("provider_not_enabled"));
  assert.ok(result.reasons.includes("paypal_test_credentials_missing"));
});

test("production never enables the in-process mock adapter", async () => {
  Object.assign(paymentRuntimeConfig, { mode: "mock" });
  const result = await eligibilityService.evaluate("mock", "INR", [], 0);
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.includes("mock_not_available"));
});

test("sandbox does not accept live credentials or activate an unrequested provider", async () => {
  process.env.STRIPE_PRIVATE_KEY = "sk_live_synthetic_not_a_real_key";
  assert.equal((await eligibilityService.evaluate("stripe", "INR", [], 0)).eligible, false);
  Object.assign(paymentRuntimeConfig, { requestedProviders: [] });
  assert.equal((await eligibilityService.evaluate("razorpay", "INR", [], 0)).eligible, false);
});

async function methods(authenticated: boolean) {
  const app = express();
  app.use((req, _res, next) => { req.session = (authenticated ? { userId: "synthetic-buyer" } : {}) as any; next(); });
  registerPaymentRoutes(app, { getUserId: req => req.session.userId });
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server!.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return fetch(`http://127.0.0.1:${address.port}/api/payments/methods?quoteId=${quoteId}`);
}

test("checkout methods HTTP response enables the real sandbox flows and keeps PayPal disabled", async () => {
  const response = await methods(true);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.mode, "sandbox");
  const options = new Map(body.methods.map((item: any) => [item.id, item])) as Map<string, any>;
  assert.equal(options.get("stripe").available, true);
  assert.equal(options.get("stripe").flow, "redirect");
  assert.equal(options.get("razorpay").available, true);
  assert.equal(options.get("razorpay").flow, "client_sdk");
  assert.equal(options.get("paypal").available, false);
});

test("payment methods still require an authenticated active account before quote access", async () => {
  assert.equal((await methods(false)).status, 401);
  assert.equal(quoteReads, 0);
});
