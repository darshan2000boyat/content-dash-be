"use strict";

module.exports = [
    {
        method: "GET",
        path: "/thumbnails",
        handler: "thumbnail.getThumbnails",
        config: {
            policies: [],
            auth: false, // Public access for fetching thumbnails
        },
    },
];
