import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, key);

  const { email, password, full_name } = await req.json();

  // Find tenant
  const { data: tenant, error: tErr } = await admin
    .from("tenants").select("id").eq("slug", "kids-point").maybeSingle();
  if (tErr || !tenant) return new Response(JSON.stringify({ error: "tenant not found" }), { status: 400, headers: corsHeaders });

  // Try create auth user
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });

  let userId = created?.user?.id;
  if (cErr) {
    // Maybe already exists
    const { data: list } = await admin.auth.admin.listUsers();
    const existing = list?.users?.find((u) => u.email === email);
    if (!existing) return new Response(JSON.stringify({ error: cErr.message }), { status: 400, headers: corsHeaders });
    userId = existing.id;
  }

  const { error: upErr } = await admin.from("users").upsert({
    id: userId, tenant_id: tenant.id, email, full_name, role: "admin", active: true,
  }, { onConflict: "id" });
  if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 400, headers: corsHeaders });

  return new Response(JSON.stringify({ ok: true, user_id: userId }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
