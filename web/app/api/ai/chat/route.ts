import OpenAI from "openai";
import { z } from "zod";

import { assistantHistoryMaxLength, assistantHistoryMaxMessageLength, assistantHistoryMaxMessages } from "@/lib/finance/assistant-history";
import { assistantOutputSchema, buildAssistantPrompt } from "@/lib/finance/assistant-prompt";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { transactionCategories, transactionSchema } from "@/lib/finance/validation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  message: z.string().trim().min(1).max(4_000),
  year: z.union([z.literal("all"), z.string().regex(/^(19|20|21)\d{2}$/)]),
  month: z.union([z.literal("all"), z.string().regex(/^(0[1-9]|1[0-2])$/)]),
  includeFinanceData: z.boolean().default(false),
  images: z.array(z.string().max(700_000)).max(5).optional(),
  imageDataUrl: z.string().max(3_000_000).optional(),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(assistantHistoryMaxMessageLength),
  }).strict()).max(assistantHistoryMaxMessages)
    .refine((history) => history.reduce((length, item) => length + item.content.length, 0) <= assistantHistoryMaxLength)
    .default([]),
}).strict().refine((body) => !(body.images?.length && body.imageDataUrl)
  && (body.images ?? (body.imageDataUrl ? [body.imageDataUrl] : [])).reduce((size, image) => size + image.length, 0) <= 3_200_000);

const assistantOutputValidator = z.object({
  reply: z.string().trim().min(1).max(4_000),
  transaction_proposal: z.object({
    transaction_date: z.string().max(20),
    transaction_type: z.enum(["income", "expense", "investment", "transfer"]),
    description: z.string().max(240),
    amount_thb: z.string().max(32),
    category: z.string().max(80),
    action: z.string().max(240),
  }).strict().nullable(),
}).strict();

type AssistantOutput = z.infer<typeof assistantOutputValidator>;

type ParsedAssistantOutput = {
  output: AssistantOutput;
  fallbackReason: "invalid_json" | "invalid_schema" | null;
};

function extractIncompleteReply(candidate: string) {
  const match = /\"reply\"\s*:\s*\"/.exec(candidate);
  if (!match || match.index === undefined) return null;
  const start = match.index + match[0].length;
  let raw = "";
  let escaped = false;
  let complete = false;
  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (escaped) {
      raw += `\\${char}`;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === '"') {
      complete = true;
      break;
    } else {
      raw += char;
    }
  }
  if (escaped) raw = raw.slice(0, -1);

  if (complete) {
    try {
      return JSON.parse(`"${raw}"`) as string;
    } catch {
      // Fall through to a forgiving text-only decoder below.
    }
  }

  return raw.replace(/\\u([0-9a-f]{4})/gi, (_escape, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\(["\\/bfnrt])/g, (_escape, token: string) => ({
      '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t",
    })[token] ?? token)
    .replace(/\\./g, (escape) => escape.slice(1))
    .trim();
}

function parseAssistantOutput(content: string): ParsedAssistantOutput {
  const candidate = content.trim();
  const candidates = [candidate];

  // Some OpenAI-compatible chat endpoints wrap JSON in Markdown despite the prompt.
  // Extract one balanced object and still validate every field before using a proposal.
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const extracted = candidate.slice(start, index + 1);
        if (extracted !== candidate) candidates.push(extracted);
      }
    }
  }

  let parsedJson = false;
  for (const value of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
      parsedJson = true;
    } catch {
      continue;
    }

    const validated = assistantOutputValidator.safeParse(parsed);
    if (validated.success) return { output: validated.data, fallbackReason: null };

    // Preserve useful prose from a partially compliant response, but never turn
    // an invalid proposal into a saveable transaction card.
    const replyOnly = z.object({ reply: z.string().trim().min(1).max(4_000) }).passthrough().safeParse(parsed);
    if (replyOnly.success) {
      return {
        output: { reply: replyOnly.data.reply, transaction_proposal: null },
        fallbackReason: "invalid_schema",
      };
    }
  }

  const recoveredReply = extractIncompleteReply(candidate);
  if (recoveredReply && recoveredReply.length <= 4_000) {
    return {
      output: { reply: recoveredReply, transaction_proposal: null },
      fallbackReason: parsedJson ? "invalid_schema" : "invalid_json",
    };
  }

  const looksLikeJson = candidate.startsWith("{") || candidate.startsWith("```") || /\"transaction_proposal\"\s*:/.test(candidate);
  if (!looksLikeJson && candidate.length > 0 && candidate.length <= 4_000) {
    return {
      output: { reply: candidate, transaction_proposal: null },
      fallbackReason: parsedJson ? "invalid_schema" : "invalid_json",
    };
  }

  return {
    output: { reply: "เป๋าวีนอ่านคำตอบได้ไม่ครบในรอบนี้ ลองส่งอีกครั้งได้เลยนะ", transaction_proposal: null },
    fallbackReason: parsedJson ? "invalid_schema" : "invalid_json",
  };
}

type TransactionRow = {
  transaction_date: string;
  transaction_type: "income" | "expense" | "investment" | "transfer";
  description: string;
  amount_thb: number | string;
  category: string;
};

function mentionsTax(message: string) {
  return /ภาษี|ลดหย่อน|ยื่นภาษี|ภาษีเงินได้|tax|deduct|allowance/i.test(message);
}

function bangkokToday() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function makeFinanceContext(rows: TransactionRow[], year: string, month: string, taxRows: Array<{ record_type: string; tax_category: string; amount_thb: number | string | null; review_status: string }>) {
  const totals = { income: 0, expense: 0, investment: 0, transfer: 0 };
  const categories = new Map<string, number>();
  for (const row of rows) {
    const amount = Number(row.amount_thb);
    totals[row.transaction_type] += amount;
    if (row.transaction_type === "expense") categories.set(row.category, (categories.get(row.category) ?? 0) + amount);
  }
  const taxQuestion = taxRows.length > 0;
  return JSON.stringify({
    scope: { year: year === "all" ? "all" : Number(year) + 543, month, recordCount: rows.length },
    note: "Totals and categories cover up to the 60 newest transactions returned for this selected scope. Item details are limited to the 20 newest; descriptions are shortened.",
    totals_thb: totals,
    expense_categories_thb: [...categories.entries()].map(([category, amount]) => ({ category, amount_thb: amount })).sort((a, b) => b.amount_thb - a.amount_thb).slice(0, 12),
    recent_transactions: rows.slice(0, 20).map((row) => ({
      date: row.transaction_date,
      type: row.transaction_type,
      description: row.description.slice(0, 120),
      amount_thb: Number(row.amount_thb),
      category: row.category,
    })),
    ...(taxQuestion ? { tax_records_for_selected_calendar_year: taxRows.map((row) => ({
      record_type: row.record_type,
      category: row.tax_category,
      amount_thb: row.amount_thb === null ? null : Number(row.amount_thb),
      review_status: row.review_status,
    })) } : {}),
  });
}

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) return Response.json({ error: "Authentication is not configured." }, { status: 503 });

  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(request.url).origin;
  if (!origin || origin !== expectedOrigin) return Response.json({ error: "Request origin could not be verified." }, { status: 403 });

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 3_800_000) return Response.json({ error: "ข้อความหรือภาพมีขนาดใหญ่เกินไป ลองเลือกภาพที่เล็กลงนะ" }, { status: 413 });

  let rawBody: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 3_800_000) return Response.json({ error: "ข้อความหรือภาพมีขนาดใหญ่เกินไป ลองเลือกภาพที่เล็กลงนะ" }, { status: 413 });
    rawBody = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Send a valid JSON request." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) return Response.json({ error: "Check your message and selected period, then try again." }, { status: 400 });

  const imageDataUrls = parsed.data.images ?? (parsed.data.imageDataUrl ? [parsed.data.imageDataUrl] : []);
  const validatedImages: string[] = [];
  for (const imageDataUrl of imageDataUrls) {
    const match = imageDataUrl.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match) return Response.json({ error: "แนบได้เฉพาะภาพ JPG, PNG หรือ WebP" }, { status: 400 });
    const imageBytes = Buffer.from(match[2], "base64");
    const mime = match[1];
    const validSignature = mime === "jpeg" ? imageBytes[0] === 0xff && imageBytes[1] === 0xd8 && imageBytes[2] === 0xff
      : mime === "png" ? imageBytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      : imageBytes.toString("ascii", 0, 4) === "RIFF" && imageBytes.toString("ascii", 8, 12) === "WEBP";
    const maxImageBytes = parsed.data.images ? 480_000 : 2_200_000;
    if (!validSignature || imageBytes.length > maxImageBytes || imageBytes.toString("base64") !== match[2]) {
      return Response.json({ error: "ตรวจสอบภาพไม่ผ่านหรือไฟล์ใหญ่เกินไป ลองเลือกภาพใหม่อีกครั้งนะ" }, { status: 400 });
    }
    validatedImages.push(imageDataUrl);
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getClaims();
  const userId = authData?.claims?.sub;
  if (authError || typeof userId !== "string") return Response.json({ error: "Sign in to continue." }, { status: 401 });

  const model = process.env.OPENAI_MODEL?.trim() || "gpt-6-luna";
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!model || !apiKey || !process.env.SUPABASE_SECRET_KEY) {
    return Response.json({ error: "AI ยังไม่พร้อม กรุณาตรวจ API key และการตั้งค่างบในหน้าตั้งค่า" }, { status: 503 });
  }

  const { year, month } = parsed.data;
  const dateRange = year !== "all" && month !== "all" ? (() => {
    const startDate = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
    const endDate = new Date(Date.UTC(Number(year), Number(month), 1));
    return { start: startDate.toISOString().slice(0, 10), end: endDate.toISOString().slice(0, 10) };
  })() : year !== "all" ? { start: `${year}-01-01`, end: `${Number(year) + 1}-01-01` } : null;
  const scopeLabel = `${year === "all" ? "all years" : `tax year ${Number(year) + 543}`}${month === "all" ? " / all months" : ` / month ${month}`}`;
  let context = "No transaction records were shared for this message. Give general guidance and say when account-specific details are needed.";
  let transactionCount = 0;
  let taxRecordCount = 0;
  let taxLookupPerformed = false;
  let includedFinanceData = false;

  if (parsed.data.includeFinanceData) {
    const scopedQuery = dateRange ? supabase.from("transactions")
      .select("transaction_date,transaction_type,description,amount_thb,category")
      .eq("user_id", userId).gte("transaction_date", dateRange.start).lt("transaction_date", dateRange.end)
      .order("transaction_date", { ascending: false }).limit(2000) : supabase.from("transactions")
      .select("transaction_date,transaction_type,description,amount_thb,category")
      .eq("user_id", userId).gte("transaction_date", "1900-01-01")
      .order("transaction_date", { ascending: false }).limit(5000);
    const { data: allRows, error: rowsError } = await scopedQuery;
    if (rowsError || !allRows) return Response.json({ error: "Could not load the selected period's records. Please try again." }, { status: 503 });
    const filteredRows = month === "all" ? allRows : allRows.filter((row) => row.transaction_date.slice(5, 7) === month);
    const rows = filteredRows.slice(0, 60);
    transactionCount = rows.length;
    let taxRows: Array<{ record_type: string; tax_category: string; amount_thb: number | string | null; review_status: string }> = [];
    if (mentionsTax(parsed.data.message)) {
      let taxQuery = supabase.from("tax_records").select("record_type,tax_category,amount_thb,review_status").eq("user_id", userId);
      if (year !== "all") taxQuery = taxQuery.eq("tax_year", Number(year) + 543);
      const { data, error } = await taxQuery.order("created_at", { ascending: false }).limit(20);
      if (error || !data) return Response.json({ error: "Could not load the selected period's tax preparation records. Please try again." }, { status: 503 });
      taxRows = data;
      taxRecordCount = data.length;
      taxLookupPerformed = true;
    }
    context = makeFinanceContext(rows as TransactionRow[], year, month, taxRows);
    includedFinanceData = true;
  }

  const systemPrompt = buildAssistantPrompt({
    categories: transactionCategories,
    date: bangkokToday(),
    scopeLabel,
    accountContext: context,
  });
  const input: OpenAI.Responses.ResponseInput = [
    { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
    ...parsed.data.history.map((item) => ({ role: item.role, content: item.content })),
    {
      role: "user",
      content: [
        { type: "input_text", text: parsed.data.message },
        ...validatedImages.map((imageDataUrl) => ({ type: "input_image" as const, image_url: imageDataUrl, detail: "high" as const })),
      ],
    },
  ];
  const estimatedInputTokens = Math.ceil((systemPrompt.length + parsed.data.history.reduce((sum, item) => sum + item.content.length, 0) + parsed.data.message.length) * 1.6) + validatedImages.length * 6_000;
  const requestId = crypto.randomUUID();
  const serviceClient = createServiceClient();
  const { data: reservation, error: reservationError } = await serviceClient.rpc("reserve_ai_request", {
    p_user_id: userId,
    p_request_id: requestId,
    p_model: model,
    p_estimated_input_tokens: Math.max(1, estimatedInputTokens),
  });

  if (reservationError) {
    const reason = reservationError.message.includes("AI_DISABLED") ? "AI budget policy has not been enabled yet." :
      reservationError.message.includes("USER_DAILY_LIMIT") ? "You have reached today's AI limit." :
      reservationError.message.includes("GLOBAL_DAILY_LIMIT") ? "AI is temporarily unavailable for today." :
      reservationError.message.includes("INPUT_LIMIT") ? "This message and selected context exceed the current AI limit." :
      "AI budget limits are not configured yet.";
    const status = reason.includes("limit") || reason.includes("today") ? 429 : 503;
    return Response.json({ error: reason }, { status });
  }

  try {
    let abortController: AbortController | undefined;
    const stream = new ReadableStream<Uint8Array>({
      cancel() { abortController?.abort(); },
      start(controller) {
        const encoder = new TextEncoder();
        const send = (event: string, data: unknown) => {
          if (!abortController?.signal.aborted) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        const localAbortController = new AbortController();
        abortController = localAbortController;
        const onAbort = () => localAbortController.abort();
        request.signal.addEventListener("abort", onAbort, { once: true });

        void (async () => {
          try {
            const client = new OpenAI({ apiKey, timeout: 55_000, maxRetries: 0 });
            const responseStream = client.responses.stream({
              model,
              store: false,
              reasoning: { effort: "medium" },
              input,
              max_output_tokens: reservation.max_output_tokens,
              text: { format: { type: "json_schema", name: "paoween_finance_reply", strict: true, schema: assistantOutputSchema } },
            }, { signal: localAbortController.signal });
            let lastReply = "";
            let streamedJson = "";
            for await (const event of responseStream) {
              if (event.type !== "response.output_text.delta") continue;
              streamedJson += event.delta;
              const partialReply = extractIncompleteReply(streamedJson);
              if (partialReply && partialReply.startsWith(lastReply) && partialReply.length > lastReply.length) {
                send("delta", { text: partialReply.slice(lastReply.length) });
                lastReply = partialReply;
              }
            }
            const result = await responseStream.finalResponse();
            if (result.status !== "completed") {
              console.error("[paoween-ai] provider response did not complete", {
                requestId,
                model,
                status: result.status,
                providerCode: result.status === "failed" ? result.error?.code ?? null : null,
                providerType: result.status === "failed" ? result.error?.type ?? null : null,
                incompleteReason: result.status === "incomplete" ? result.incomplete_details?.reason ?? null : null,
              });
              throw new Error("OpenAI response did not complete.");
            }
            const inputTokens = result.usage?.input_tokens;
            const outputTokens = result.usage?.output_tokens;
            const cachedInputTokens = result.usage?.input_tokens_details?.cached_tokens ?? 0;
            if (!Number.isInteger(inputTokens) || !Number.isInteger(outputTokens) ||
                !Number.isInteger(cachedInputTokens) || cachedInputTokens < 0 || cachedInputTokens > (inputTokens ?? 0)) {
              send("error", { error: "OpenAI ไม่ส่งข้อมูล usage ที่ตรวจสอบได้ จึงคงวงเงินสำรองของคำขอนี้ไว้", requestId });
              return;
            }
            const { error: finalizeError } = await serviceClient.rpc("finish_ai_request", {
              p_user_id: userId,
              p_request_id: requestId,
              p_input_tokens: inputTokens,
              p_output_tokens: outputTokens,
              p_succeeded: true,
              p_cached_input_tokens: cachedInputTokens,
            });
            if (finalizeError) {
              send("error", { error: "สร้างคำตอบแล้ว แต่บันทึก usage ไม่สำเร็จ จึงคงวงเงินสำรองไว้", requestId });
              return;
            }

            let parsedOutput = parseAssistantOutput(result.output_text ?? "");
            if (parsedOutput.fallbackReason) {
              console.warn("[paoween-ai] response schema did not validate", { requestId, model, fallbackReason: parsedOutput.fallbackReason });
            }
            const structured = parsedOutput.output;
            let proposal = structured.transaction_proposal;
            if (proposal && !transactionSchema.safeParse(proposal).success) {
              proposal = null;
              structured.reply += " รายการมีข้อมูลไม่ครบหรือรูปแบบไม่ถูกต้อง จึงยังร่างเป็นรายการให้บันทึกไม่ได้";
            }
            if (proposal && /^(?:create|save|add|record|insert|update|delete|expense|income|transfer|investment|purchase|buy|payment)(?:\s+(?:transaction|record|entry|expense|income|transfer))?$/i.test(proposal.action.trim())) proposal.action = "";
            if (proposal) {
              const thaiReply = /[\u0E00-\u0E7F]/.test(parsed.data.message);
              structured.reply = thaiReply
                ? "ร่างไว้แล้วครับ ตรวจยอดกับวันที่บนการ์ดได้เลย"
                : "Draft ready. Check the amount and date on the card.";
            }
            if (structured.reply !== lastReply) send("replace", { text: structured.reply });
            send("complete", {
              requestId,
              proposal,
              context: includedFinanceData ? { year, month, transactionCount, taxRecordCount, taxLookupPerformed } : null,
              usage: { inputTokens, outputTokens },
            });
          } catch (error) {
            const details = (error && typeof error === "object" ? error : {}) as {
              status?: unknown;
              code?: unknown;
              type?: unknown;
              param?: unknown;
              requestID?: unknown;
            };
            const providerStatus = typeof details.status === "number" ? details.status : null;
            const providerCode = typeof details.code === "string" ? details.code.slice(0, 80) : null;
            const providerType = typeof details.type === "string" ? details.type.slice(0, 80) : null;
            const providerParam = typeof details.param === "string" ? details.param.slice(0, 120) : null;
            const providerRequestId = typeof details.requestID === "string" ? details.requestID.slice(0, 100) : null;
            const knownRejectedRequest = providerStatus !== null && providerStatus >= 400 && providerStatus < 500 && providerStatus !== 408;

            // A definite client rejection cannot have produced a billable response; release that reservation.
            // Keep it held for timeouts, connection failures, and other uncertain provider outcomes.
            if (knownRejectedRequest) {
              try {
                const { error: releaseError } = await serviceClient.rpc("finish_ai_request", {
                  p_user_id: userId,
                  p_request_id: requestId,
                  p_input_tokens: 0,
                  p_output_tokens: 0,
                  p_succeeded: false,
                  p_cached_input_tokens: 0,
                });
                if (releaseError) console.error("[paoween-ai] rejected request reservation release failed", { requestId });
              } catch {
                console.error("[paoween-ai] rejected request reservation release failed", { requestId });
              }
            }

            // Log only provider status/classification metadata, never prompts, images, or API credentials.
            console.error("[paoween-ai] streaming request failed", {
              requestId,
              model,
              errorType: error instanceof Error ? error.name : "unknown",
              providerStatus,
              providerCode,
              providerType,
              providerParam,
              providerRequestId,
            });
            send("error", { error: "เป๋าวีนตอบไม่สำเร็จ ลองใหม่อีกครั้งนะ", requestId });
          } finally {
            request.signal.removeEventListener("abort", onAbort);
            try { controller.close(); } catch { /* The client may have cancelled the stream. */ }
          }
        })();
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } });
  } catch {
    return Response.json({ error: "OpenAI could not complete this request.", requestId }, { status: 502 });
  }
}
