/**
 * BattleGrid MCP client over Streamable HTTP (JSON-RPC 2.0).
 *
 * The remote endpoint (https://mcp.battlegrid.trade/mcp) answers tools/call with
 * `application/json` and does not require a persisted session for stateless calls,
 * but we still perform a best-effort `initialize` handshake and forward any
 * `Mcp-Session-Id` it returns. Responses are parsed from JSON or SSE.
 */

export interface McpClientOptions {
  url: string;
  apiKey: string;
  timeoutMs?: number;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
}

export class McpError extends Error {
  code: number;
  data: unknown;
  constructor(code: number, message: string, data?: unknown) {
    super(`MCP error ${code}: ${message}`);
    this.code = code;
    this.data = data;
  }
}

export class McpClient {
  private url: string;
  private apiKey: string;
  private timeoutMs: number;
  private id = 0;
  private sessionId: string | null = null;
  private initialized = false;

  constructor(opts: McpClientOptions) {
    this.url = opts.url;
    this.apiKey = opts.apiKey;
    this.timeoutMs = opts.timeoutMs ?? 45_000;
  }

  private nextId(): number {
    return ++this.id;
  }

  private async raw(body: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const sid = res.headers.get("mcp-session-id");
      if (sid) this.sessionId = sid;
      return res;
    } finally {
      clearTimeout(t);
    }
  }

  /** Parse a JSON or text/event-stream response into the JSON-RPC message. */
  private async parse(res: Response): Promise<JsonRpcResponse> {
    const ct = res.headers.get("content-type") ?? "";
    const text = await res.text();
    if (!res.ok && !text) {
      throw new McpError(res.status, `HTTP ${res.status} ${res.statusText}`);
    }
    if (ct.includes("text/event-stream")) {
      // take the last `data:` payload that parses as a JSON-RPC message
      let last: JsonRpcResponse | null = null;
      for (const line of text.split(/\r?\n/)) {
        const m = line.match(/^data:\s?(.*)$/);
        if (!m || !m[1]) continue;
        try {
          const obj = JSON.parse(m[1]);
          if (obj && typeof obj === "object" && "id" in obj) last = obj;
        } catch {
          /* ignore keep-alives */
        }
      }
      if (!last) throw new McpError(-1, "No JSON-RPC message in SSE stream", text.slice(0, 400));
      return last;
    }
    try {
      return JSON.parse(text) as JsonRpcResponse;
    } catch {
      throw new McpError(res.status, `Non-JSON response: ${text.slice(0, 400)}`);
    }
  }

  private async rpc(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const res = await this.raw({ jsonrpc: "2.0", id: this.nextId(), method, params });
    const msg = await this.parse(res);
    if (msg.error) throw new McpError(msg.error.code, msg.error.message, msg.error.data);
    return msg.result;
  }

  private async ensureInit(): Promise<void> {
    if (this.initialized) return;
    try {
      await this.rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "bg9bit-agent", version: "0.1.0" },
      });
      // notifications/initialized is a notification (no id / no response expected)
      await this.raw({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }).catch(() => {});
    } catch {
      // The remote endpoint tolerates stateless calls; proceed even if init is rejected.
    }
    this.initialized = true;
  }

  async listTools(): Promise<Array<{ name: string; description?: string; inputSchema?: unknown }>> {
    await this.ensureInit();
    const r = await this.rpc("tools/list", {});
    return r.tools ?? [];
  }

  /**
   * Call a tool. BattleGrid returns its payload as `content[0].text` — usually a
   * JSON string. We JSON-parse it when possible and otherwise return raw text.
   */
  async callTool<T = any>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    await this.ensureInit();
    const r = await this.rpc("tools/call", { name, arguments: args });
    if (r?.isError) {
      const txt = r?.content?.[0]?.text ?? JSON.stringify(r);
      throw new McpError(-32000, `Tool ${name} failed: ${txt}`);
    }
    const first = r?.content?.[0];
    if (first?.type === "text" && typeof first.text === "string") {
      const s = first.text.trim();
      if (s.startsWith("{") || s.startsWith("[")) {
        try {
          return JSON.parse(s) as T;
        } catch {
          return first.text as unknown as T;
        }
      }
      return first.text as unknown as T;
    }
    if (r?.structuredContent !== undefined) return r.structuredContent as T;
    return r as T;
  }

  async readResource(uri: string): Promise<string> {
    await this.ensureInit();
    const r = await this.rpc("resources/read", { uri });
    return r?.contents?.[0]?.text ?? "";
  }
}
