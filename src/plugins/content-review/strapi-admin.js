"use strict";

import { Eye } from "@strapi/icons";
import pluginId from "./admin/src/pluginId.js";

const plugin = {
    register(app) {
        app.registerPlugin({
            id: pluginId,
            initializer: () => null,
            isReady: true,
            name: pluginId,
        });

        app.addMenuLink({
            to: `plugins/${pluginId}`,
            icon: Eye,
            intlLabel: {
                id: `${pluginId}.plugin.name`,
                defaultMessage: "Content Review",
            },
            Component: async () => {
                const mod = await import("./admin/src/pages/App.jsx");
                return mod.default;
            },
            permissions: [],
        });
    },

    bootstrap() {},

    async registerTrads({ locales }) {
        return Promise.all(locales.map((locale) => ({ data: {}, locale })));
    },
};

export default plugin;
