// ─────────────────────────────────────────────────────────────────────────────
// AnalyzerBPM™ — Supabase Edge Function: send-otp
// Generates a 6-digit OTP, stores it in otp_codes table, and sends it
// to the user's email via Resend.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

serve(async (req) => {

  // ── Handle CORS preflight ──────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    // ── Parse request body ───────────────────────────────────────────────────
    const { email } = await req.json()
    if (!email || typeof email !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid email address." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const normalised = email.trim().toLowerCase()

    // ── Initialise Supabase client with service role (bypasses RLS for writes)
    const supabase = createClient(
      Deno.env.get("APP_SUPABASE_URL") ?? "",
      Deno.env.get("SERVICE_ROLE_KEY")  ?? "",
    )

    // ── Generate 6-digit OTP ─────────────────────────────────────────────────
    const code      = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 min

    // ── Store OTP in database ────────────────────────────────────────────────
    const { error: dbError } = await supabase
      .from("otp_codes")
      .insert({ email: normalised, code, expires_at: expiresAt, used: false })

    if (dbError) {
      console.error("DB insert error:", dbError)
      return new Response(
        JSON.stringify({ error: "Failed to store login code. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ── Send email via Resend ────────────────────────────────────────────────
    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${Deno.env.get("RESEND_API_KEY") ?? ""}`,
      },
      body: JSON.stringify({
        from:    "AnalyzerBPM <noreply@analyzerbpm.com>",  // must match your verified Resend domain
        to:      [normalised],
        subject: "Your AnalyzerBPM login code",
        html: `
          <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;">
            <h1 style="font-size:22px;font-weight:800;color:#1B2B3A;margin:0 0 8px;">
              AnalyzerBPM&#8482;
            </h1>
            <p style="font-size:14px;color:#4B5563;margin:0 0 28px;">
              Business Process Maturity Assessment
            </p>
            <p style="font-size:15px;color:#111827;margin:0 0 16px;">
              Your login code is:
            </p>
            <div style="font-size:40px;font-weight:800;letter-spacing:10px;color:#1B2B3A;
                        background:#F0F2F4;border-radius:10px;padding:20px 24px;
                        text-align:center;margin:0 0 24px;">
              ${code}
            </div>
            <p style="font-size:13px;color:#6B7280;margin:0 0 8px;">
              This code expires in <strong>10 minutes</strong>.
              If you did not request this, you can safely ignore this email.
            </p>
            <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0;"/>
            <p style="font-size:11px;color:#9CA3AF;margin:0;">
              &copy; 2026 AnalyzerBPM&#8482;. All rights reserved.<br/>
              tellus@analyzerbpm.com
            </p>
          </div>
        `,
      }),
    })

    if (!resendRes.ok) {
      const resendError = await resendRes.text()
      console.error("Resend error:", resendError)
      return new Response(
        JSON.stringify({ error: "Failed to send login code. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // ── Success ──────────────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )

  } catch (err) {
    console.error("Unexpected error:", err)
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
