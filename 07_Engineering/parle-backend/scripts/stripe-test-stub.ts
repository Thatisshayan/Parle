import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 12111);
const server = createServer(async (request, response) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const body = Buffer.concat(chunks).toString("utf8");
  if (request.headers.authorization !== "Bearer sk_test_parle_ci_stub") {
    response.writeHead(401, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: { message: "invalid test key" } }));
    return;
  }

  if (request.method === "POST" && request.url === "/v1/checkout/sessions") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({
      id: "cs_test_parle_ci_fixture",
      object: "checkout.session",
      url: "https://checkout.stripe.com/c/pay/cs_test_parle_ci_fixture",
      mode: "subscription",
      status: "open",
      payment_status: "unpaid",
      livemode: false,
      expires_at: Math.floor(Date.now() / 1000) + 1800,
      metadata: {},
      request_body_received: body.length > 0,
    }));
    return;
  }

  if (request.method === "GET" && request.url?.startsWith("/v1/subscriptions/")) {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: {
      type: "invalid_request_error",
      code: "resource_missing",
      message: "No such subscription: " + decodeURIComponent(request.url.slice("/v1/subscriptions/".length)),
      param: "subscription",
    } }));
    return;
  }

  response.writeHead(404, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: { type: "invalid_request_error", code: "resource_missing", message: "Unsupported Stripe test request" } }));
});

server.listen(port, "0.0.0.0", () => console.log(`local Stripe test stub listening on ${port}`));
