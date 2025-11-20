"use strict";

module.exports = ({ strapi }) => ({
    /**
     * Get thumbnails from component schemas (info.thumbnail field)
     * This is the only source of thumbnails - read directly from component JSON files
     */
    getSchemaBasedThumbnails() {
        const components = strapi.components;
        const thumbnails = {};

        Object.entries(components).forEach(([uid, component]) => {
            if (component.info?.thumbnail) {
                thumbnails[uid] = component.info.thumbnail;
            }
        });

        strapi.log.debug(
            `Found ${
                Object.keys(thumbnails).length
            } component thumbnails from schemas`
        );

        return thumbnails;
    },

    /**
     * Get all thumbnails (alias for getSchemaBasedThumbnails for consistency)
     */
    getAllThumbnails() {
        return this.getSchemaBasedThumbnails();
    },
});
