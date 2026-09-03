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

      // The database function determines the Colombo business date itself.
      // The authenticated caller ID is passed explicitly so the database can
      // independently verify both identity and administrator status.
      const { data, error } = await ctx.supabaseAdmin.rpc(
        "admin_clear_today",
        { p_admin_id: callerId }
      );

      if (error) {
        console.error("admin_clear_today failed:", error);

        // A started/completed route is an expected business-rule rejection,
        // not a server failure. Preserve the database protection and expose
        // the correct HTTP status to the frontend.
        if (
          error.code === "P0001" &&
          error.message?.includes("route session has already started")
        ) {
          return json(
            {
              error:
                "Cannot clear today's data because a route session has already started or completed.",
            },
            409
          );
        }

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
