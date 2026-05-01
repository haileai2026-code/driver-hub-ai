// Server-only Meta WhatsApp Cloud API helper.
// Imported only from *.functions.ts and route server handlers.

const META_API_VERSION = "v21.0";

export type WhatsAppSendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string; status?: number };

function normalizePhone(phone: string): string {
  // Meta requires E.164 without leading "+".
  return phone.replace(/[^\d]/g, "");
}

export async function sendWhatsAppText(
  toPhone: string,
  body: string,
): Promise<WhatsAppSendResult> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    return { ok: false, error: "WhatsApp credentials not configured." };
  }

  const to = normalizePhone(toPhone);
  if (!to) return { ok: false, error: "Missing recipient phone number." };

  const res = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    },
  );

  const json = (await res.json().catch(() => ({}))) as {
    messages?: Array<{ id: string }>;
    error?: { message?: string };
  };

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: json?.error?.message ?? `Meta API error ${res.status}`,
    };
  }

  return { ok: true, messageId: json.messages?.[0]?.id ?? "" };
}
