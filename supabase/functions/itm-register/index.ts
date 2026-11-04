import { createClient } from "npm:@supabase/supabase-js@2.57.0";

// Server-only account enrollment. Passwords are handled by Supabase Auth;
// the client never receives the service role key, and no plaintext is saved in GitHub.
const ALLOWED = new Set(["https://p0emkite.github.io", "http://localhost:8000", "http://127.0.0.1:8000"]);
function respond(body: Record<string, unknown>, status: number, origin: string) {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "vary": "Origin" });
  if (ALLOWED.has(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-methods", "POST, OPTIONS");
    headers.set("access-control-allow-headers", "apikey, authorization, content-type");
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}
const USERNAME = /^[a-z][a-z0-9_]{3,19}$/;
const emailFor = (name: string) => "itm." + name + "@accounts.itm.example";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return respond({}, 204, origin);
  if (req.method !== "POST" || !ALLOWED.has(origin))
    return respond({ error: "지원하지 않는 요청입니다." }, 403, origin);
  const length = Number(req.headers.get("content-length") || "0");
  if (length > 2048) return respond({ error: "요청 크기를 초과했어." }, 413, origin);

  let body: { username?: unknown; password?: unknown };
  try { body = await req.json(); }
  catch { return respond({ error: "입력값을 확인해 줘." }, 400, origin); }
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = body.password;
  if (!USERNAME.test(username))
    return respond({ error: "아이디는 영문 소문자로 시작하는 4~20자의 영문·숫자·밑줄만 사용할 수 있어." }, 400, origin);
  if (typeof password !== "string" || password.length < 10 || password.length > 72 ||
      !/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
    return respond({ error: "비밀번호는 영문과 숫자를 포함한 10~72자로 설정해 줘." }, 400, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return respond({ error: "계정 서버 구성이 필요해." }, 503, origin);
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // Best-effort private per-client rate limit. No raw client IP is stored.
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") ||
     req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim().slice(0, 80);
  const keyMaterial = new TextEncoder().encode(ip + ":" + key.slice(0, 40));
  const hashBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", keyMaterial));
  const clientHash = Array.from(hashBytes, b => b.toString(16).padStart(2, "0")).join("");
  const { data: canAttempt, error: limitError } = await admin.rpc("itm_signup_attempt", { p_client_hash: clientHash });
  if (limitError || canAttempt !== true)
    return respond({ error: limitError ? "가입 요청을 처리할 수 없어." : "가입 시도가 많아. 1시간 뒤 다시 시도해 줘." }, 429, origin);

  const { error } = await admin.auth.admin.createUser({
    email: emailFor(username),
    password,
    email_confirm: true,
    app_metadata: { itm_named_account: true }
  });
  if (error) {
    const msg = (error.message || "").toLowerCase();
    if (msg.includes("already") || msg.includes("exists") || error.status === 422)
      return respond({ error: "이미 사용 중인 아이디야. 다른 아이디를 선택해 줘." }, 409, origin);
    return respond({ error: "계정 생성에 실패했어. 입력값을 확인하거나 다시 시도해 줘." }, 400, origin);
  }
  return respond({ ok: true }, 201, origin);
});
