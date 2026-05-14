import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import { AddressInfo } from "net";

describe("E2E: Webhook Server", () => {
  let app: express.Express;
  let server: ReturnType<express.Express["listen"]>;
  let baseUrl: string;

  beforeAll(async () => {
    process.env.WEBHOOK_SECRET = "test-secret";
    process.env.TARGET_REPO = process.cwd();

    app = express();
    app.use(express.json());

    app.get("/health", (_req, res) => {
      res.json({ status: "ok", agents: ["researchTestAgent", "editorAgent"], workflows: ["testFixWorkflow"] });
    });

    app.post("/webhook/generate-and-test", async (req, res) => {
      const sig = req.headers["x-webhook-signature"] as string;
      if (!sig) {
        return res.status(401).json({ error: "Invalid signature" });
      }
      const crypto = await import("crypto");
      const expected = crypto
        .createHmac("sha256", process.env.WEBHOOK_SECRET!)
        .update(JSON.stringify(req.body))
        .digest("hex");

      if (sig !== `sha256=${expected}`) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      const { repoUrl, branch } = req.body;
      if (!repoUrl || !branch) {
        return res.status(400).json({ error: "repoUrl and branch are required" });
      }

      res.json({ status: "ok", prUrl: null, changedFiles: [] });
    });

    app.post("/webhook/test-and-fix", async (req, res) => {
      const sig = req.headers["x-webhook-signature"] as string;
      if (!sig) {
        return res.status(401).json({ error: "Invalid signature" });
      }
      const crypto = await import("crypto");
      const expected = crypto
        .createHmac("sha256", process.env.WEBHOOK_SECRET!)
        .update(JSON.stringify(req.body))
        .digest("hex");

      if (sig !== `sha256=${expected}`) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      const { repoUrl, branch } = req.body;
      if (!repoUrl || !branch) {
        return res.status(400).json({ error: "repoUrl and branch are required" });
      }

      res.json({ status: "ok", prUrl: null, changedFiles: [] });
    });

    server = app.listen(0);
    const port = (server.address() as AddressInfo).port;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    server.close();
    delete process.env.WEBHOOK_SECRET;
    delete process.env.TARGET_REPO;
  });

  describe("Health Check", () => {
    it("should return 200 with agent list", async () => {
      const res = await fetch(`${baseUrl}/health`);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.status).toBe("ok");
      expect(body.agents).toContain("researchTestAgent");
      expect(body.agents).toContain("editorAgent");
      expect(body.workflows).toContain("testFixWorkflow");
    });
  });

  describe("Webhook Signature Verification", () => {
    it("should reject requests without signature", async () => {
      const res = await fetch(`${baseUrl}/webhook/test-and-fix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetDir: "/tmp/test" }),
      });
      expect(res.status).toBe(401);
    });

    it("should reject requests with invalid signature", async () => {
      const res = await fetch(`${baseUrl}/webhook/test-and-fix`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-signature": "sha256=invalid",
        },
        body: JSON.stringify({ targetDir: "/tmp/test" }),
      });
      expect(res.status).toBe(401);
    });

    it("should accept requests with valid signature", async () => {
      const crypto = await import("crypto");
      const body = JSON.stringify({ targetDir: "/tmp/test" });
      const sig = crypto
        .createHmac("sha256", "test-secret")
        .update(body)
        .digest("hex");

      const res = await fetch(`${baseUrl}/webhook/test-and-fix`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-signature": `sha256=${sig}`,
        },
        body,
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.status).toBe("ok");
    });
  });

  describe("Webhook Endpoints", () => {
    it("should reject test-and-fix without repoUrl", async () => {
      const crypto = await import("crypto");
      const body = JSON.stringify({ repoUrl: "https://github.com/test/repo" });
      const sig = crypto
        .createHmac("sha256", "test-secret")
        .update(body)
        .digest("hex");

      const res = await fetch(`${baseUrl}/webhook/test-and-fix`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-signature": `sha256=${sig}`,
        },
        body,
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("repoUrl and branch are required");
    });

    it("should reject generate-and-test without repoUrl", async () => {
      const crypto = await import("crypto");
      const body = JSON.stringify({ branch: "main" });
      const sig = crypto
        .createHmac("sha256", "test-secret")
        .update(body)
        .digest("hex");

      const res = await fetch(`${baseUrl}/webhook/generate-and-test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-signature": `sha256=${sig}`,
        },
        body,
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("repoUrl and branch are required");
    });

    it("should accept valid generate-and-test request", async () => {
      const crypto = await import("crypto");
      const body = JSON.stringify({ repoUrl: "https://github.com/test/repo", branch: "main" });
      const sig = crypto
        .createHmac("sha256", "test-secret")
        .update(body)
        .digest("hex");

      const res = await fetch(`${baseUrl}/webhook/generate-and-test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-signature": `sha256=${sig}`,
        },
        body,
      });
      expect(res.status).toBe(200);
    });
  });
});
