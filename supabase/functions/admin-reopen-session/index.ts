import { withSupabase } from "npm:@supabase/server@^1";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status });

const isValidUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    try {
      if (req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
      }

      const callerId = ctx.userClaims?.sub;
      if (!callerId || !isValidUuid(callerId)) {
        return json({ error: "Unauthorized" }, 401);
      }

      // Authorization is checked against the database, not a client claim.
      const { data: profile, error: profileError } = await ctx.supabase
        .from("profiles")
        .select("role")
        .eq("id", callerId)
        .maybeSingle();

      if (profileError) {
        console.error("Admin role check failed:", profileError);
        return json({ error: "Unable to verify administrator access" }, 500);
      }

      if (profile?.role !== "admin") {
        return json({ error: "Admin access required" }, 403);
      }

      let body: Record<string, unknown>;
      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }

      const sessionId = typeof body.session_id === "string"
        ? body.session_id.trim()
        : "";
      const targetStatus = typeof body.target_status === "string"
        ? body.target_status.trim()
        : "active";

      if (!isValidUuid(sessionId)) {
        return json({ error: "A valid session_id is required" }, 400);
      }

      if (targetStatus !== "active" && targetStatus !== "pending") {
        return json({ error: "target_status must be active or pending" }, 400);
      }

      // The privileged RPC is callable only by the server-side service role.
      // The database independently verifies p_admin_id and performs the
      // lifecycle transition under the dedicated route_session_admin role.
      const { data, error } = await ctx.supabaseAdmin.rpc(
        "admin_reopen_route_session",
        {
          p_session_id: sessionId,
          p_admin_id: callerId,
          p_target_status: targetStatus,
        },
      );

      if (error) {
        console.error("admin_reopen_route_session failed:", error);

        if (error.code === "P0001") {
          return json({ error: error.message }, 409);
        }

        return json({ error: "Failed to reopen route session" }, 500);
      }

      return json({ success: true, result: data });
    } catch (error) {
      console.error("admin-reopen-session error:", error);
      return json(
        {
          error: error instanceof Error ? error.message : "Internal server error",
        },
        500,
      );
    }
  }),
};
