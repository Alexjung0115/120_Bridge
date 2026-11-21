import { z } from "zod";

export class ModelUnavailable extends Error {}
export class InvalidModelOutput extends Error {}

export class ResponsesClient {
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetcher: typeof fetch;

  constructor(
    endpoint: string, apiKey: string, model: string, fetcher: typeof fetch = fetch,
  ) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.model = model;
    this.fetcher = fetcher;
  }

  async structured<T>(
    instructions: string,
    input: unknown,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
    isCurrent: () => boolean = () => true,
  ): Promise<T> {
    const payload = {
      model: this.model, store: false, instructions, input: JSON.stringify(input),
      text: { format: { type: "json_schema", name: "DialogueCandidate",
        strict: true, schema: z.toJSONSchema(schema) } },
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      const timeout = AbortSignal.timeout(10_000);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let response: Response;
      try {
        response = await this.fetcher(this.endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(payload), signal: combined,
        });
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        if (timeout.aborted) throw new DOMException("Model timeout", "TimeoutError");
        if (attempt === 0) continue;
        throw new ModelUnavailable("Model transport unavailable", { cause: error });
      }
      if (!response.ok) {
        if (attempt === 0 && [502, 503, 504].includes(response.status)) continue;
        throw new ModelUnavailable(`Model HTTP ${response.status}`);
      }
      let body: unknown;
      try { body = await response.json(); }
      catch { throw new InvalidModelOutput("Invalid model response"); }
      if (signal?.aborted) throw signal.reason;
      if (!isCurrent()) throw new DOMException("Stale model result", "AbortError");
      const envelope = z.object({
        status: z.literal("completed"),
        output: z.array(z.object({
          type: z.string(),
          content: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional(),
        })),
      }).safeParse(body);
      const parts = envelope.success
        ? envelope.data.output.filter((item) => item.type === "message").flatMap((item) => item.content ?? [])
        : [];
      if (parts.length !== 1 || parts[0].type !== "output_text" || !parts[0].text) {
        throw new InvalidModelOutput("Missing structured model output");
      }
      try { return schema.parse(JSON.parse(parts[0].text)); }
      catch { throw new InvalidModelOutput("Model output failed validation"); }
    }
    throw new ModelUnavailable("Model unavailable");
  }
}
