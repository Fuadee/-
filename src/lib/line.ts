const LINE_PUSH_API_URL = "https://api.line.me/v2/bot/message/push";

export async function sendLineGroupNotification(message: string): Promise<void> {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const lineGroupId = process.env.LINE_GROUP_ID;

  if (!channelAccessToken || !lineGroupId) {
    throw new Error("LINE notification is not configured: LINE_CHANNEL_ACCESS_TOKEN and LINE_GROUP_ID are required.");
  }

  const response = await fetch(LINE_PUSH_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`
    },
    body: JSON.stringify({
      to: lineGroupId,
      messages: [{ type: "text", text: message }]
    })
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    const error = new Error(`LINE push API failed with status ${response.status}: ${responseText || response.statusText}`);
    console.error("LINE group notification failed:", error);
    throw error;
  }
}
