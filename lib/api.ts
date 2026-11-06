import type { SupabaseClient } from "@supabase/supabase-js";

export interface ChatMessage {
  role: string;
  content: string;
}

export interface ChatResponse {
  response: string;
  remaining_credits_seconds: number;
}

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export async function sendChatToBackend(params: {
  mode: string;
  messages: ChatMessage[];
  accessToken: string;
}): Promise<ChatResponse> {
  const response = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      mode: params.mode,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  const data = (await response.json().catch(() => ({}))) as Partial<ChatResponse> & { detail?: string };

  if (!response.ok) {
    throw new ApiError(data.detail || "Error al comunicarse con la IA", response.status);
  }

  return {
    response: data.response ?? "",
    remaining_credits_seconds: data.remaining_credits_seconds ?? 0,
  };
}

export async function fetchCredits(supabase: SupabaseClient, userId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("credits_seconds")
    .eq("id", userId)
    .single();

  if (error) return null;

  return data?.credits_seconds ?? 0;
}
