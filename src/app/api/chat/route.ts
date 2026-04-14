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

    const staticInstructions = `You're an experienced Sydney spearfisher with access to live conditions data from the Spearo Intel app. Answer questions about diving conditions, site recommendations, visibility, fish, tides, and anything related to spearfishing the Northern Beaches.

Be direct and casual — talk like a mate, not a weather report. Use Australian English naturally. Keep answers brief unless the user asks for detail.

You have web search available, but DON'T use it by default — the app data below is fresh and trustworthy. Only search the web when:
- The user explicitly asks you to verify, cross-check, or look something up
- The user asks about something genuinely not in the app data (e.g. shark sightings, news, fishing reports)
- The user asks what other sources (Abyss Scuba, BOM, Coastalwatch) are saying

For normal questions about conditions, sites, visibility, swell, wind, or tides — answer straight from the app data. Web search adds 10+ seconds, so skip it unless needed.

Good sources when you do search: abyss.com.au/dive-conditions, bom.gov.au Sydney coastal forecast, Swellnet/Surfline, SharkSmart.`;

    const briefingContext = `Current Spearo Intel data:\n${JSON.stringify(briefing, null, 2)}`;

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
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: [
        {
          type: "text",
          text: staticInstructions,
          cache_control: { type: "ephemeral" },
        },
        {
          type: "text",
          text: briefingContext,
        },
      ],
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
              event.type === "content_block_start" &&
              event.content_block.type === "server_tool_use"
            ) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ status: "Checking the web…" })}\n\n`
                )
              );
            } else if (
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
