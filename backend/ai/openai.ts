import OpenAI from "openai";

export function getOpenAIModel(): string {
  // Accept the display-style spacing used in local configuration, e.g.
  // "gpt-6 luna", while sending the provider's canonical model identifier.
  return (process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini").replace(/\s+/g, "-");
}

export function createOpenAIClient(): OpenAI | undefined {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return undefined;
  return new OpenAI({
    apiKey,
    baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL?.trim() || undefined,
    timeout: 30_000,
    maxRetries: 0,
  });
}

export async function completeOpenAIText(
  client: OpenAI,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  options: { maxTokens: number; json?: boolean },
): Promise<string> {
  const model = getOpenAIModel();
  const completion = await client.chat.completions.create({
    model,
    messages,
    max_completion_tokens: options.maxTokens,
    // These short interactive tasks need visible output within their token
    // budget instead of consuming it on the GPT-6 default reasoning effort.
    ...(/^gpt-6(?:[.-]|$)/.test(model) ? { reasoning_effort: "none" as const } : {}),
    ...(options.json ? { response_format: { type: "json_object" as const } } : {}),
    store: false,
  });
  const choice = completion.choices[0];
  const text = choice?.message.content?.trim();
  if (!text || choice.finish_reason === "length") {
    throw new Error("AI response was empty or incomplete");
  }
  return text;
}

export function aiProviderFailure(error: unknown): {
  status: number;
  code: string;
  error: string;
} {
  const status = error instanceof OpenAI.APIError ? error.status : undefined;
  if (status === 401 || status === 403 || status === 404) {
    return { status: 503, code: "AI_CONFIGURATION_ERROR", error: "The AI provider configuration needs attention. Please contact the platform administrator." };
  }
  if (status === 429) {
    return { status: 429, code: "AI_PROVIDER_BUSY", error: "The AI provider is busy or its usage limit has been reached. Please try again later." };
  }
  return { status: 503, code: "AI_UNAVAILABLE", error: "The AI assistant is temporarily unavailable. Please try again in a moment." };
}
