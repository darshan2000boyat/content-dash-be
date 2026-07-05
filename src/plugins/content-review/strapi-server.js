"use strict";

// The review logic lives in the main app (src/api/dashboard-project/
// controllers/review-admin.ts) so it can reuse the shared TypeScript helpers.
// This plugin mounts it on the ADMIN router (function handlers delegate to
// that controller), which gives the routes real admin-session authentication —
// the controller then enforces the Super Admin role.

const ctrl = () => strapi.controller("api::dashboard-project.review-admin");

const route = (method, path, action) => ({
    method,
    path,
    handler: (ctx) => ctrl()[action](ctx),
    config: { policies: ["admin::isAuthenticatedAdmin"] },
});

module.exports = {
    register({ strapi }) {
        strapi.log.info("Content Review plugin registered");
    },
    bootstrap() {},
    destroy() {},

    routes: {
        admin: {
            type: "admin",
            routes: [
                route("GET", "/projects", "listProjects"),
                route("GET", "/projects/:projectId/submissions", "listSubmissions"),
                route("GET", "/projects/:projectId/check-token", "checkToken"),
                route("PUT", "/projects/:projectId/token", "updateToken"),
                route("GET", "/submissions/:documentId", "getSubmission"),
                route("POST", "/submissions/:documentId/publish", "publishSubmission"),
                route("POST", "/submissions/:documentId/reject", "rejectSubmission"),
            ],
        },
    },
};
