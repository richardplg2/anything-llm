const { safeJsonParse } = require("../utils/http");
const prisma = require("../utils/prisma");

const Invite = {
  makeCode: () => {
    const uuidAPIKey = require("uuid-apikey");
    return uuidAPIKey.create().apiKey;
  },

  create: async function ({
    createdByUserId = 0,
    workspaceIds = [],
    maxUses = null,
  }) {
    try {
      const invite = await prisma.invites.create({
        data: {
          code: this.makeCode(),
          createdBy: createdByUserId,
          workspaceIds: JSON.stringify(workspaceIds),
          maxUses: maxUses,
          usedCount: 0,
          claimedByUsers: JSON.stringify([]),
        },
      });
      return { invite, error: null };
    } catch (error) {
      console.error("FAILED TO CREATE INVITE.", error.message);
      return { invite: null, error: error.message };
    }
  },

  deactivate: async function (inviteId = null) {
    try {
      await prisma.invites.update({
        where: { id: Number(inviteId) },
        data: { status: "disabled" },
      });
      return { success: true, error: null };
    } catch (error) {
      console.error(error.message);
      return { success: false, error: error.message };
    }
  },

  markClaimed: async function (inviteId = null, user) {
    try {
      // Get current invite to check limits and existing users
      const currentInvite = await prisma.invites.findFirst({
        where: { id: Number(inviteId) },
      });

      if (!currentInvite) {
        return { success: false, error: "Invite not found" };
      }

      // Check if invite is still available
      if (currentInvite.status === "disabled") {
        return { success: false, error: "Invite has been disabled" };
      }

      // Parse current claimed users
      const claimedUsers = safeJsonParse(currentInvite.claimedByUsers) || [];

      // Check if user already claimed this invite
      if (claimedUsers.includes(user.id)) {
        return {
          success: false,
          error: "User has already claimed this invite",
        };
      }

      // Check usage limits
      if (
        currentInvite.maxUses !== null &&
        currentInvite.usedCount >= currentInvite.maxUses
      ) {
        return { success: false, error: "Invite usage limit reached" };
      }

      // Add user to claimed users list
      const updatedClaimedUsers = [...claimedUsers, user.id];
      const newUsedCount = currentInvite.usedCount + 1;

      // Determine new status
      let newStatus = currentInvite.status;
      if (
        currentInvite.maxUses !== null &&
        newUsedCount >= currentInvite.maxUses
      ) {
        newStatus = "exhausted"; // All uses consumed
      } else if (newUsedCount === 1 && currentInvite.status === "pending") {
        newStatus = "active"; // First use
      }

      const invite = await prisma.invites.update({
        where: { id: Number(inviteId) },
        data: {
          status: newStatus,
          claimedByUsers: JSON.stringify(updatedClaimedUsers),
          usedCount: newUsedCount,
          lastUpdatedAt: new Date(),
        },
      });

      try {
        if (!!invite?.workspaceIds) {
          const { Workspace } = require("./workspace");
          const { WorkspaceUser } = require("./workspaceUsers");
          const workspaceIds = (await Workspace.where({})).map(
            (workspace) => workspace.id
          );
          const ids = safeJsonParse(invite.workspaceIds)
            .map((id) => Number(id))
            .filter((id) => workspaceIds.includes(id));
          if (ids.length !== 0) await WorkspaceUser.createMany(user.id, ids);
        }
      } catch (e) {
        console.error(
          "Could not add user to workspaces automatically",
          e.message
        );
      }

      return { success: true, error: null };
    } catch (error) {
      console.error(error.message);
      return { success: false, error: error.message };
    }
  },

  get: async function (clause = {}) {
    try {
      const invite = await prisma.invites.findFirst({ where: clause });
      return invite || null;
    } catch (error) {
      console.error(error.message);
      return null;
    }
  },

  count: async function (clause = {}) {
    try {
      const count = await prisma.invites.count({ where: clause });
      return count;
    } catch (error) {
      console.error(error.message);
      return 0;
    }
  },

  delete: async function (clause = {}) {
    try {
      await prisma.invites.deleteMany({ where: clause });
      return true;
    } catch (error) {
      console.error(error.message);
      return false;
    }
  },

  where: async function (clause = {}, limit) {
    try {
      const invites = await prisma.invites.findMany({
        where: clause,
        take: limit || undefined,
      });
      return invites;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  whereWithUsers: async function (clause = {}, limit) {
    const { User } = require("./user");
    try {
      const invites = await this.where(clause, limit);
      for (const invite of invites) {
        // Handle multiple claimed users
        if (invite.claimedByUsers) {
          const claimedUserIds = safeJsonParse(invite.claimedByUsers) || [];
          const claimedUsers = [];

          for (const userId of claimedUserIds) {
            const acceptedUser = await User.get({ id: userId });
            if (acceptedUser) {
              claimedUsers.push({
                id: acceptedUser.id,
                username: acceptedUser.username,
              });
            }
          }

          invite.claimedBy = claimedUsers; // Keep backward compatibility with field name
          invite.claimedUsers = claimedUsers; // New field for clarity
        }

        if (invite.createdBy) {
          const createdUser = await User.get({ id: invite.createdBy });
          invite.createdBy = {
            id: createdUser?.id,
            username: createdUser?.username,
          };
        }
      }
      return invites;
    } catch (error) {
      console.error(error.message);
      return [];
    }
  },

  // Check if invite is still available for use
  isAvailable: function (invite, userId = null) {
    if (!invite) return false;
    if (invite.status === "disabled") return false;
    if (invite.status === "exhausted") return false;

    // Check usage limits
    if (invite.maxUses !== null && invite.usedCount >= invite.maxUses)
      return false;

    // Check if specific user already claimed (if userId provided)
    if (userId) {
      const claimedUsers = safeJsonParse(invite.claimedByUsers) || [];
      if (claimedUsers.includes(userId)) return false;
    }

    return true;
  },

  // Get remaining uses for an invite
  getRemainingUses: function (invite) {
    if (!invite) return 0;
    if (invite.maxUses === null) return "unlimited";
    return Math.max(0, invite.maxUses - invite.usedCount);
  },
};

module.exports = { Invite };
