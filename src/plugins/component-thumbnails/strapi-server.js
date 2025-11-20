"use strict";

module.exports = {
    register({ strapi }) {
        strapi.log.info("Component Thumbnails plugin registered");
    },

    bootstrap({ strapi }) {
        // Plugin bootstrap logic
    },

    destroy({ strapi }) {
        // Plugin destroy logic
    },

    controllers: {
        thumbnail: require("./server/controllers/thumbnail"),
    },

    services: {
        thumbnail: require("./server/services/thumbnail"),
    },

    routes: require("./server/routes"),
};
