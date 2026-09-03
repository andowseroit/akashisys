import { withSupabase } from "npm:@supabase/server@^1";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status });

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    try {
      if (req.method !== "POST") {
        return json({ error: "Method not allowed" }, 405);
      }

      const callerId = ctx.userClaims?.sub;

      if (!callerId) {
        return json({ error: "Unauthorized" }, 401);
      }

      // Verify the caller's server-controlled application role.
      const { data: profile, error: profileError } = await ctx.supabase
        .from("profiles")
        .select("role")
        .eq("id", callerId)
        .maybeSingle();

      if (profileError) {
        console.error("Admin role check failed:", profileError);

        return json(
          { error: "Unable to verify administrator access" },
          500
        );
      }

      if (profile?.role !== "admin") {
        return json({ error: "Admin access required" }, 403);
      }

      // The database function determines CURRENT_DATE itself.
      // No date supplied by the browser is trusted.
      const { data, error } = await ctx.supabaseAdmin.rpc(
        "admin_clear_today"
      );

      if (error) {
        console.error("admin_clear_today failed:", error);

        return json(
          { error: "Unable to clear today's data" },
          500
        );
      }

      return json({
        success: true,
        result: data,
      });
    } catch (error) {
      console.error("admin-clear-today error:", error);

      return json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Internal server error",
        },
        500
      );
    }
  }),
};