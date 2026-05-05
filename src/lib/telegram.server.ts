// Server-only Telegram Bot helper via Lovable connector gateway.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/telegram";

export const BENY_CHAT_ID = "5039079360";

export type TelegramSendResult =
  | { ok: true; messageId: number }
  | { ok: false; error: string; status?: number };

function isValidChatId(value: string): boolean {
  return /^-?\d{4,}$/.test(value.trim());
}

export async function sendTelegramText(
  chatId: string | number,
  text: string,
): Promise<TelegramSendResult> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const tgKey = process.env.TELEGRAM_API_KEY;
  if (!lovableKey || !tgKey) {
    return { ok: false, error: "Telegram לא מחובר (חסר LOVABLE_API_KEY או TELEGRAM_API_KEY)." };
  }

  const chatIdStr = String(chatId).trim();
  if (!isValidChatId(chatIdStr)) {
    return {
      ok: false,
      error: `Telegram Chat ID לא תקין: "${chatIdStr}". נדרש מזהה מספרי.`,
    };
  }

  const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": tgKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ chat_id: Number(chatIdStr), text }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
    result?: { message_id: number };
  };

  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      status: res.status,
      error: data.description ?? `Telegram API error ${res.status}`,
    };
  }

  return { ok: true, messageId: data.result?.message_id ?? 0 };
}

export async function getTelegramUpdates(
  offset: number,
  timeoutSec: number,
): Promise<{
  ok: boolean;
  updates: Array<{
    update_id: number;
    message?: {
      message_id: number;
      from?: { id: number; username?: string };
      chat: { id: number };
      text?: string;
      date: number;
    };
  }>;
  error?: string;
}> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const tgKey = process.env.TELEGRAM_API_KEY;
  if (!lovableKey || !tgKey) {
    return { ok: false, updates: [], error: "Telegram not configured" };
  }
  const res = await fetch(`${GATEWAY_URL}/getUpdates`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": tgKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      offset,
      timeout: timeoutSec,
      allowed_updates: ["message"],
    }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: unknown;
    description?: string;
  };
  if (!res.ok || data.ok === false) {
    return { ok: false, updates: [], error: data.description ?? `HTTP ${res.status}` };
  }
  return { ok: true, updates: (data.result ?? []) as never };
}
