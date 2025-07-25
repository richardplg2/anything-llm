const { Document } = require("../models/documents");
const { normalizePath, documentsPath, isWithin } = require("../utils/files");
const { reqBody, userFromSession } = require("../utils/http");
const {
  flexUserRoleValid,
  ROLES,
} = require("../utils/middleware/multiUserProtected");
const { validatedRequest } = require("../utils/middleware/validatedRequest");
const fs = require("fs");
const path = require("path");

function documentEndpoints(app) {
  if (!app) return;
  app.post(
    "/document/create-folder",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { name } = reqBody(request);
        const user = await userFromSession(request, response); // Ensure user is authenticated
        const userDocumentsPath = path.join(documentsPath, user.id.toString());
        if (!fs.existsSync(userDocumentsPath)) {
          fs.mkdirSync(userDocumentsPath, { recursive: true });
        }
        if (!name || name.trim() === "") {
          response.status(400).json({
            success: false,
            message: "Folder name cannot be empty.",
          });
          return;
        }
        const storagePath = path.join(userDocumentsPath, normalizePath(name));
        if (
          !isWithin(path.resolve(userDocumentsPath), path.resolve(storagePath))
        )
          throw new Error("Invalid folder name.");

        if (fs.existsSync(storagePath)) {
          response.status(500).json({
            success: false,
            message: "Folder by that name already exists",
          });
          return;
        }

        fs.mkdirSync(storagePath, { recursive: true });
        response.status(200).json({ success: true, message: null });
      } catch (e) {
        console.error(e);
        response.status(500).json({
          success: false,
          message: `Failed to create folder: ${e.message} `,
        });
      }
    }
  );

  app.post(
    "/document/move-files",
    [validatedRequest, flexUserRoleValid([ROLES.admin, ROLES.manager])],
    async (request, response) => {
      try {
        const { files } = reqBody(request);
        const docpaths = files.map(({ from }) => from);
        const user = await userFromSession(request, response); // Ensure user is authenticated
        const userDocumentsPath = path.join(documentsPath, user.id.toString());
        const documents = await Document.where({ docpath: { in: docpaths } });

        const embeddedFiles = documents.map((doc) => doc.docpath);
        const moveableFiles = files.filter(
          ({ from }) => !embeddedFiles.includes(from)
        );

        const movePromises = moveableFiles.map(({ from, to }) => {
          const sourcePath = path.join(userDocumentsPath, normalizePath(from));
          const destinationPath = path.join(
            userDocumentsPath,
            normalizePath(to)
          );

          return new Promise((resolve, reject) => {
            if (
              !isWithin(userDocumentsPath, sourcePath) ||
              !isWithin(userDocumentsPath, destinationPath)
            )
              return reject("Invalid file location");

            fs.rename(sourcePath, destinationPath, (err) => {
              if (err) {
                console.error(`Error moving file ${from} to ${to}:`, err);
                reject(err);
              } else {
                resolve();
              }
            });
          });
        });

        Promise.all(movePromises)
          .then(() => {
            const unmovableCount = files.length - moveableFiles.length;
            if (unmovableCount > 0) {
              response.status(200).json({
                success: true,
                message: `${unmovableCount}/${files.length} files not moved. Unembed them from all workspaces.`,
              });
            } else {
              response.status(200).json({
                success: true,
                message: null,
              });
            }
          })
          .catch((err) => {
            console.error("Error moving files:", err);
            response
              .status(500)
              .json({ success: false, message: "Failed to move some files." });
          });
      } catch (e) {
        console.error(e);
        response
          .status(500)
          .json({ success: false, message: "Failed to move files." });
      }
    }
  );
}

module.exports = { documentEndpoints };
