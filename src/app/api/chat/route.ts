import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { generateBriefing } from "../../../engine/briefing";

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "Chat unavailable — API key not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const { message, history } = (await request.json()) as {
      message: string;
      history: { role: "user" | "assistant"; content: string }[];
    };

    // Fetch current briefing data
    const briefing = await generateBriefing();

    const systemPrompt = `You're an experienced Sydney spearfisher with access to live conditions data from the Spearo Intel app (provided below). Answer questions about diving conditions, site recommendations, visibility, fish, tides, and anything related to spearfishing the Northern Beaches.

You also have web search available. Use it when:
- The user asks you to verify or cross-check conditions
- The user asks about something not in the app data (e.g. shark alerts, specific news, fishing reports)
- The user asks what other sources are saying (Abyss Scuba, Coastalwatch, BOM forecasts)
- You think the app data might be stale or questionable

Good sources to search when cross-checking:
- abyss.com.au/dive-conditions (expert daily dive report)
- bom.gov.au Sydney coastal forecast
- Swellnet or Surfline for swell
- SharkSmart for shark activity

Be direct and casual — talk like a mate, not a weather report. Use Australian English naturally. If you find a discrepancy between our data and a web source, flag it clearly.

Current Spearo Intel data:
${JSON.stringify(briefing, null, 2)}`;

    // Truncate history to last 10 messages
    const truncatedHistory = history.slice(-10);

    const messages: Anthropic.MessageParam[] = [
      ...truncatedHistory.map((msg) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    const client = new Anthropic({ apiKey });

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages,
      tools: [
        {
          type: "web_search_20250305",
          name: "web_search",
        },
      ],
    });

    // Stream text deltas back to the client
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
              );
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (err) {
          console.error("Stream error:", err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response(
      JSON.stringify({ error: "Chat unavailable — something went wrong" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export const dynamic = "force-dynamic";
