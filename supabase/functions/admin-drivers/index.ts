import { withSupabase } from "npm:@supabase/server@^1";

const json = (body: unknown, status = 200) =>
  Response.json(body, { status });

const isValidEmail = (email: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const isValidUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

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

      // Verify that the authenticated caller is an admin.
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

      let body: Record<string, unknown>;

      try {
        body = await req.json();
      } catch {
        return json({ error: "Invalid JSON body" }, 400);
      }

      const action =
        typeof body.action === "string" ? body.action.trim() : "";

      if (!["create", "update", "toggle", "delete"].includes(action)) {
        return json({ error: "Unknown action" }, 400);
      }

      const admin = ctx.supabaseAdmin;

      // ---------------------------------------------------------
      // CREATE DRIVER AUTH USER
      // ---------------------------------------------------------
      if (action === "create") {
        const email =
          typeof body.email === "string"
            ? body.email.trim().toLowerCase()
            : "";

        const password =
          typeof body.password === "string" ? body.password : "";

        if (!isValidEmail(email)) {
          return json({ error: "A valid email is required" }, 400);
        }

        if (password.length < 8) {
          return json(
            { error: "Password must be at least 8 characters" },
            400
          );
        }

        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (error) {
          console.error("Auth user creation failed:", error);
          return json({ error: error.message }, 400);
        }

        return json({
          success: true,
          userId: data.user?.id,
        });
      }

      // ---------------------------------------------------------
      // COMMON TARGET USER VALIDATION
      // ---------------------------------------------------------
      const userId =
        typeof body.userId === "string" ? body.userId.trim() : "";

      if (!userId || !isValidUuid(userId)) {
        return json({ error: "A valid user ID is required" }, 400);
      }

      if (userId === callerId) {
        return json(
          {
            error:
              "You cannot use driver management actions on your own admin account",
          },
          403
        );
      }

      // Only allow this endpoint to operate on users actually linked
      // to a driver_accounts record.
      const { data: driver, error: driverError } = await ctx.supabase
        .from("driver_accounts")
        .select("id, auth_user_id")
        .eq("auth_user_id", userId)
        .limit(1)
        .maybeSingle();

      if (driverError) {
        console.error("Driver lookup failed:", driverError);
        return json(
          { error: "Unable to verify driver account" },
          500
        );
      }

      if (!driver) {
        return json(
          { error: "Target user is not a registered driver" },
          404
        );
      }

      // ---------------------------------------------------------
      // UPDATE DRIVER AUTH USER
      // ---------------------------------------------------------
      if (action === "update") {
        const updates: {
          email?: string;
          password?: string;
        } = {};

        if (typeof body.email === "string" && body.email.trim()) {
          const email = body.email.trim().toLowerCase();

          if (!isValidEmail(email)) {
            return json({ error: "A valid email is required" }, 400);
          }

          updates.email = email;
        }

        if (typeof body.password === "string" && body.password.length > 0) {
          if (body.password.length < 8) {
            return json(
              { error: "Password must be at least 8 characters" },
              400
            );
          }

          updates.password = body.password;
        }

        if (Object.keys(updates).length === 0) {
          return json(
            { error: "No account changes were provided" },
            400
          );
        }

        const { data, error } =
          await admin.auth.admin.updateUserById(userId, updates);

        if (error) {
          console.error("Auth user update failed:", error);
          return json({ error: error.message }, 400);
        }

        return json({
          success: true,
          userId: data.user?.id,
        });
      }

      // ---------------------------------------------------------
      // ENABLE / DISABLE DRIVER AUTH USER
      // ---------------------------------------------------------
      if (action === "toggle") {
        if (typeof body.active !== "boolean") {
          return json(
            { error: "The active value must be true or false" },
            400
          );
        }

        const active = body.active;

        const { data, error } =
          await admin.auth.admin.updateUserById(userId, {
            ban_duration: active ? "none" : "87600h",
          });

        if (error) {
          console.error("Auth user toggle failed:", error);
          return json({ error: error.message }, 400);
        }

        return json({
          success: true,
          userId: data.user?.id,
          active,
        });
      }

      // ---------------------------------------------------------
      // DELETE DRIVER AUTH USER
      // ---------------------------------------------------------
      if (action === "delete") {
        const { error } = await admin.auth.admin.deleteUser(userId);

        if (error) {
          console.error("Auth user deletion failed:", error);
          return json({ error: error.message }, 400);
        }

        return json({
          success: true,
          userId,
        });
      }

      return json({ error: "Unsupported action" }, 400);
    } catch (error) {
      console.error("admin-drivers error:", error);

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