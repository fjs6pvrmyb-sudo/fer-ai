import type { NextConfig } from "next";

// OWASP ASVS 5.0.0 baseline: browser protections that do not change
// authentication, financial transactions or existing application flows.
// CSP requires a separate nonce/integrity rollout with browser validation.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
] as const;

const config: NextConfig = {
  // FER AI owns the development instructions in AGENTS.md.
  agentRules: false,
  async headers() {
    return [{ source: "/:path*", headers: [...securityHeaders] }];
  },
};

export default config;
