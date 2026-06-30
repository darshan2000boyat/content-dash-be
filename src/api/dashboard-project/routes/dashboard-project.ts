export default {
  routes: [
    { method: "POST", path: "/projects/register", handler: "api::dashboard-project.dashboard-project.register", config: { auth: false, policies: [], middlewares: [] } },
    { method: "POST", path: "/projects/login",    handler: "api::dashboard-project.dashboard-project.login",    config: { auth: false, policies: [], middlewares: [] } },
    { method: "GET",  path: "/projects/me",       handler: "api::dashboard-project.dashboard-project.me",       config: { auth: false, policies: [], middlewares: [] } },

    // Target CMS introspection (uses the project's stored host + token)
    { method: "GET",  path: "/projects/target/pages",      handler: "api::dashboard-project.dashboard-project.targetPages",      config: { auth: false, policies: [], middlewares: [] } },
    { method: "GET",  path: "/projects/target/page",       handler: "api::dashboard-project.dashboard-project.targetPage",       config: { auth: false, policies: [], middlewares: [] } },
    { method: "PUT",  path: "/projects/target/page",       handler: "api::dashboard-project.dashboard-project.savePage",         config: { auth: false, policies: [], middlewares: [] } },
    { method: "GET",  path: "/projects/target/components", handler: "api::dashboard-project.dashboard-project.targetComponents", config: { auth: false, policies: [], middlewares: [] } },
  ],
};
