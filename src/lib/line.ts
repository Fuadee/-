const LINE_PUSH_API_URL = "https://api.line.me/v2/bot/message/push";

const UNICODE_ESCAPE_PATTERN = /\\u([0-9a-fA-F]{4})/g;

const decodeLiteralUnicodeEscapes = (text: string): string => {
  if (!text.includes("\\u")) {
    return text;
  }

  try {
    return text.replace(UNICODE_ESCAPE_PATTERN, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  } catch {
    return text;
  }
};

const normalizeLineMessage = (message: string): string => decodeLiteralUnicodeEscapes(message);

const asTrimmedString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

type LineNotifyContext = {
  eventType: string;
  jobId?: string;
  statusTransition?: {
    from?: string;
    to?: string;
  };
  failHard?: boolean;
};

type LineConfig = {
  token: string;
  target: string;
  tokenSource: string;
  targetSource: string;
};

const resolveLineConfig = (): LineConfig | null => {
  const tokenCandidates: Array<[string, string]> = [
    ["LINE_CHANNEL_ACCESS_TOKEN", asTrimmedString(process.env.LINE_CHANNEL_ACCESS_TOKEN)],
    ["LINE_ACCESS_TOKEN", asTrimmedString(process.env.LINE_ACCESS_TOKEN)],
    ["LINE_TOKEN", asTrimmedString(process.env.LINE_TOKEN)]
  ];
  const targetCandidates: Array<[string, string]> = [
    ["LINE_GROUP_ID", asTrimmedString(process.env.LINE_GROUP_ID)],
    ["LINE_TARGET_ID", asTrimmedString(process.env.LINE_TARGET_ID)],
    ["LINE_USER_ID", asTrimmedString(process.env.LINE_USER_ID)]
  ];

  const tokenEntry = tokenCandidates.find(([, value]) => Boolean(value));
  const targetEntry = targetCandidates.find(([, value]) => Boolean(value));

  if (!tokenEntry || !targetEntry) {
    return null;
  }

  return {
    token: tokenEntry[1],
    target: targetEntry[1],
    tokenSource: tokenEntry[0],
    targetSource: targetEntry[0]
  };
};

export const hasLineNotificationConfig = (): boolean => Boolean(resolveLineConfig());

export async function sendLineNotification(message: string, context: LineNotifyContext): Promise<void> {
  const eventType = asTrimmedString(context.eventType) || "unknown";
  const jobId = asTrimmedString(context.jobId) || "-";
  const fromStatus = asTrimmedString(context.statusTransition?.from) || "-";
  const toStatus = asTrimmedString(context.statusTransition?.to) || "-";
  const shouldFailHard = Boolean(context.failHard);
  const config = resolveLineConfig();

  console.info("[LINE] notify requested");
  console.info(`[LINE] event type: ${eventType}`);
  console.info(`[LINE] job id: ${jobId}`);
  console.info(`[LINE] status transition: ${fromStatus} -> ${toStatus}`);
  console.info(`[LINE] token exists: ${config ? "yes" : "no"}`);
  console.info(`[LINE] target/group exists: ${config ? "yes" : "no"}`);

  if (!config) {
    const error = new Error(
      "LINE notification is not configured: provide LINE_CHANNEL_ACCESS_TOKEN|LINE_ACCESS_TOKEN and LINE_GROUP_ID|LINE_TARGET_ID|LINE_USER_ID"
    );
    console.error(`[LINE] notify failed: ${error.message}`);
    if (shouldFailHard) {
      throw error;
    }
    return;
  }

  if (config.tokenSource !== "LINE_CHANNEL_ACCESS_TOKEN" || config.targetSource !== "LINE_GROUP_ID") {
    console.warn("[LINE] using fallback env names", {
      tokenSource: config.tokenSource,
      targetSource: config.targetSource
    });
  }

  const normalizedMessage = normalizeLineMessage(message);

  try {
    console.info("[LINE] request start");
    const response = await fetch(LINE_PUSH_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`
      },
      body: JSON.stringify({
        to: config.target,
        messages: [{ type: "text", text: normalizedMessage }]
      })
    });

    const responseBody = await response.text().catch(() => "");
    console.info(`[LINE] response status: ${response.status}`);
    console.info(`[LINE] response body: ${responseBody || "(empty)"}`);

    if (!response.ok) {
      throw new Error(`LINE push API failed with status ${response.status}: ${responseBody || response.statusText}`);
    }

    console.info("[LINE] notify success");
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    console.error(`[LINE] notify failed: ${messageText}`);
    if (shouldFailHard) {
      throw error;
    }
  }
}

export async function sendLineGroupNotification(message: string): Promise<void> {
  await sendLineNotification(message, {
    eventType: "legacy_group_notification",
    failHard: true
  });
}
