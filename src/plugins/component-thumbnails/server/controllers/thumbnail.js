"use strict";

module.exports = ({ strapi }) => ({
    /**
     * Get all thumbnails from component schemas
     */
    async getThumbnails(ctx) {
        try {
            const thumbnails = await strapi
                .plugin("component-thumbnails")
                .service("thumbnail")
                .getAllThumbnails();

            ctx.body = { data: thumbnails };
        } catch (err) {
            strapi.log.error("Error getting thumbnails:", err);
            ctx.throw(500, err);
        }
    },
});
