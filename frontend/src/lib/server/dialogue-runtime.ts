import { after } from "next/server";
import corpus from "../../../../data/normalized/corpus.json";
import { createDialogueApi } from "../dialogue/dialogue-api";
import { ResponsesClient } from "../dialogue/model-client";
import type { Corpus } from "../retrieval/search";
import { createSupabaseSessionPersistence } from "../store/snapshot";

export function configuredDialogueApi() {
  const { BRIDGE_ENABLE_DIALOGUE, BRIDGE_CORPUS_VERSION, OPENAI_API_KEY, OPENAI_MODEL, SUPABASE_URL,
    SUPABASE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (BRIDGE_ENABLE_DIALOGUE !== "1") return null;
  const key = SUPABASE_SECRET_KEY ?? SUPABASE_SERVICE_ROLE_KEY;
  if (!OPENAI_API_KEY || !OPENAI_MODEL || !SUPABASE_URL || !key ||
      BRIDGE_CORPUS_VERSION !== corpus.corpusVersion) throw new Error("Dialogue is not configured.");
  return createDialogueApi({
    corpus: corpus as Corpus,
    model: new ResponsesClient("https://api.openai.com/v1/responses", OPENAI_API_KEY, OPENAI_MODEL),
    persistence: createSupabaseSessionPersistence(SUPABASE_URL, key),
    retainWork: (work) => after(() => work),
  });
}
