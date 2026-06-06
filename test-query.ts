import { supabaseAdmin } from "./src/integrations/supabase/client.server";

async function test() {
  const { data } = await supabaseAdmin
    .from("plans")
    .select("slug, interval, price_usd");
  console.dir(data, { depth: null });
}

test().catch(console.error);
