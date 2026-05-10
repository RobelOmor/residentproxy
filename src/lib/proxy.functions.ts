import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const inputSchema = z.object({
  username: z.string().min(1),
  passwd: z.string().min(1),
});

export const getProxyToken = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const res = await fetch("https://server.711proxy.com/eapi/token/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
      return { status: res.status, ok: res.ok, body: json };
    } catch (error) {
      return {
        status: 0,
        ok: false,
        body: { error: error instanceof Error ? error.message : "Request failed" },
      };
    }
  });
