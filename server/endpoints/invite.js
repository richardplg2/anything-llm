const { EventLogs } = require("../models/eventLogs");
const { Invite } = require("../models/invite");
const { User } = require("../models/user");
const { reqBody } = require("../utils/http");
const {
  simpleSSOLoginDisabledMiddleware,
} = require("../utils/middleware/simpleSSOEnabled");

function inviteEndpoints(app) {
  if (!app) return;

  app.get("/invite/:code", async (request, response) => {
    try {
      const { code } = request.params;
      const invite = await Invite.get({ code });
      if (!invite) {
        response.status(200).json({ invite: null, error: "Invite not found." });
        return;
      }

      if (invite.status !== "pending" && invite.status !== "active") {
        response
          .status(200)
          .json({ invite: null, error: "Invite is no longer valid." });
        return;
      }

      response
        .status(200)
        .json({ invite: { code, status: invite.status }, error: null });
    } catch (e) {
      console.error(e);
      response.sendStatus(500).end();
    }
  });

  app.post(
    "/invite/:code",
    [simpleSSOLoginDisabledMiddleware],
    async (request, response) => {
      try {
        const { code } = request.params;
        const { username, password } = reqBody(request);
        const invite = await Invite.get({ code });

        // Check if invite exists and is available for use
        if (!invite || !Invite.isAvailable(invite)) {
          let errorMessage = "Invite not found or is invalid.";
          if (invite) {
            if (invite.status === "disabled") {
              errorMessage = "This invite has been disabled.";
            } else if (invite.status === "exhausted") {
              errorMessage = "This invite has reached its usage limit.";
            } else if (
              invite.maxUses !== null &&
              invite.usedCount >= invite.maxUses
            ) {
              errorMessage = "This invite has reached its usage limit.";
            }
          }

          response.status(200).json({ success: false, error: errorMessage });
          return;
        }

        const { user, error } = await User.create({
          username,
          password,
          role: "default",
        });
        if (!user) {
          console.error("Accepting invite:", error);
          response
            .status(200)
            .json({ success: false, error: "Could not create user." });
          return;
        }

        await Invite.markClaimed(invite.id, user);
        await EventLogs.logEvent(
          "invite_accepted",
          {
            username: user.username,
          },
          user.id
        );

        response.status(200).json({ success: true, error: null });
      } catch (e) {
        console.error(e);
        response.sendStatus(500).end();
      }
    }
  );
}

module.exports = { inviteEndpoints };
