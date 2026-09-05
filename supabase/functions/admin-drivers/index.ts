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

      const {
        data: { user },
        error: userError,
      } = await ctx.supabase.auth.getUser();

      if (userError || !user) {
        console.error("Authenticated user lookup failed:", userError);
        return json({ error: "GET_USER_FAILED" }, 401);
      }

      const callerId = user.id;
      const userClient = ctx.supabase as any;
      const admin = ctx.supabaseAdmin as any;

      // Verify that the authenticated caller is an admin.
      const { data: profile, error: profileError } = await userClient
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

      // ---------------------------------------------------------
      // CREATE DRIVER AUTH USER
      // ---------------------------------------------------------
      if (action === "create") {
        const fullName =
          typeof body.full_name === "string"
            ? body.full_name.trim()
            : "";

        const phone =
          typeof body.phone === "string"
            ? body.phone.trim()
            : "";
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

        if (!fullName) {
          return json({ error: "Driver name is required" }, 400);
        }

        // Make sure this email isn't already registered as a driver.
        const { data: existingDriver, error: existingDriverError } = await admin
          .from("driver_accounts")
          .select("id")
          .eq("email", email)
          .maybeSingle();

        if (existingDriverError) {
          console.error("Existing driver lookup failed:", existingDriverError);
          return json({ error: "Unable to verify existing driver account" }, 500);
        }

        if (existingDriver) {
          return json({ error: "A driver with this email already exists" }, 409);
        }

        // Create the Supabase Auth user.
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

        if (error) {
          console.error("Auth user creation failed:", error);
          return json({ error: error.message }, 400);
        }

        const userId = data.user?.id;

        if (!userId) {
          return json({ error: "Auth user was created without an ID" }, 500);
        }

        // Create the application profile.
        const { error: profileError } = await admin
          .from("profiles")
          .insert({
            id: userId,
            role: "driver",
            name: fullName,
          });

        if (profileError) {
          console.error("Driver profile creation failed:", profileError);

          // Prevent an orphaned Auth account.
          await admin.auth.admin.deleteUser(userId);

          return json({ error: "Failed to create driver profile" }, 500);
        }

        // Create the driver business account.
        const { error: driverAccountError } = await admin
          .from("driver_accounts")
          .insert({
            full_name: fullName,
            email,
            phone: phone || null,
            is_active: true,
            auth_user_id: userId,
          });

        if (driverAccountError) {
          console.error("Driver account creation failed:", driverAccountError);

          // Prevent partially-created driver records.
          await admin.from("profiles").delete().eq("id", userId);
          await admin.auth.admin.deleteUser(userId);

          return json({ error: "Failed to create driver account" }, 500);
        }

        return json({
          success: true,
          userId,
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
      const { data: driver, error: driverError } = await userClient
        .from("driver_accounts")
        .select("id, auth_user_id, full_name, email, phone, is_active")
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
        const authUpdates: {
          email?: string;
          password?: string;
        } = {};
        const accountUpdates: {
          full_name?: string;
          email?: string;
          phone?: string | null;
        } = {};

        if (typeof body.email === "string" && body.email.trim()) {
          const email = body.email.trim().toLowerCase();

          if (!isValidEmail(email)) {
            return json({ error: "A valid email is required" }, 400);
          }

          authUpdates.email = email;
          accountUpdates.email = email;
        }

        if (typeof body.password === "string" && body.password.length > 0) {
          if (body.password.length < 8) {
            return json(
              { error: "Password must be at least 8 characters" },
              400
            );
          }

          authUpdates.password = body.password;
        }

        if (typeof body.full_name === "string") {
          const fullName = body.full_name.trim();
          if (!fullName) {
            return json({ error: "Driver name is required" }, 400);
          }
          accountUpdates.full_name = fullName;
        }

        if (typeof body.phone === "string" || body.phone === null) {
          accountUpdates.phone =
            typeof body.phone === "string" && body.phone.trim()
              ? body.phone.trim()
              : null;
        }

        if (
          Object.keys(authUpdates).length === 0 &&
          Object.keys(accountUpdates).length === 0
        ) {
          return json(
            { error: "No account changes were provided" },
            400
          );
        }

        const previousAccount = {
          full_name: driver.full_name,
          email: driver.email,
          phone: driver.phone,
        };

        if (Object.keys(accountUpdates).length > 0) {
          const { error: accountError } = await admin
            .from("driver_accounts")
            .update(accountUpdates)
            .eq("auth_user_id", userId);

          if (accountError) {
            console.error("Driver account update failed:", accountError);
            return json({ error: "Failed to update driver account" }, 500);
          }
        }

        if (accountUpdates.full_name) {
          const { error: profileUpdateError } = await admin
            .from("profiles")
            .update({ name: accountUpdates.full_name })
            .eq("id", userId)
            .eq("role", "driver");

          if (profileUpdateError) {
            console.error("Driver profile update failed:", profileUpdateError);
            await admin
              .from("driver_accounts")
              .update(previousAccount)
              .eq("auth_user_id", userId);
            return json({ error: "Failed to update driver profile" }, 500);
          }
        }

        let updatedAuthUserId = userId;

        if (Object.keys(authUpdates).length > 0) {
          const { data, error } =
            await admin.auth.admin.updateUserById(userId, authUpdates);

          if (error) {
            console.error("Auth user update failed:", error);

            if (Object.keys(accountUpdates).length > 0) {
              const { error: rollbackAccountError } = await admin
                .from("driver_accounts")
                .update(previousAccount)
                .eq("auth_user_id", userId);
              if (rollbackAccountError) {
                console.error("Driver account rollback failed:", rollbackAccountError);
              }
            }

            if (accountUpdates.full_name) {
              const { error: rollbackProfileError } = await admin
                .from("profiles")
                .update({ name: previousAccount.full_name })
                .eq("id", userId)
                .eq("role", "driver");
              if (rollbackProfileError) {
                console.error("Driver profile rollback failed:", rollbackProfileError);
              }
            }

            return json({ error: error.message }, 400);
          }

          updatedAuthUserId = data.user?.id || userId;
        }

        return json({
          success: true,
          userId: updatedAuthUserId,
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

        const { error: accountError } = await admin
          .from("driver_accounts")
          .update({ is_active: active })
          .eq("auth_user_id", userId);

        if (accountError) {
          console.error("Driver account toggle failed:", accountError);
          return json({ error: "Failed to update driver account status" }, 500);
        }

        const { data, error } =
          await admin.auth.admin.updateUserById(userId, {
            ban_duration: active ? "none" : "87600h",
          });

        if (error) {
          console.error("Auth user toggle failed:", error);
          const { error: rollbackError } = await admin
            .from("driver_accounts")
            .update({ is_active: driver.is_active })
            .eq("auth_user_id", userId);
          if (rollbackError) {
            console.error("Driver account status rollback failed:", rollbackError);
          }
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
