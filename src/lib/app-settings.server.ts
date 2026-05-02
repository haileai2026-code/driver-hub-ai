import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Fetch saved Beny Telegram chat id from app_settings (server-only). */
export async function getSavedBenyTelegramChatId(): Promise<string> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "beny_telegram")
    .maybeSingle();
  const value = (data?.value ?? {}) as { chat_id?: string };
  return (value.chat_id ?? "").trim();
}
