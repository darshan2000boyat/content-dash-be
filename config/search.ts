export default {
    search_filters: true,
    entities: [
        {
            name: "api::vacancy.vacancy",
            fields: ["PageTitle"],
            title: "PageTitle",
        },

        {
            name: "api::project.project",
            fields: ["PageTitle"],
            title: "PageTitle",
        },

        {
            name: "api::project.project",
            fields: ["PageTitle"],
            title: "PageTitle",
            match_filters: {
                ParentPages: {
                    PageType: "business-project-listing",
                },
            },
            frontend_entity: "api::projectb.projectb",
        },

        {
            name: "api::news-item.news-item",
            fields: ["PageTitle"],
            title: "PageTitle",
            frontend_entity: "api::news-and-events.news-and-events",
        },

        {
            name: "api::event.event",
            fields: ["PageTitle"],
            title: "PageTitle",
            frontend_entity: "api::news-and-events.news-and-events",
        },
    ],
    map: {
        others: [
            "api::vacancy.vacancy",
            "api::project.project",
            "api::projectb.projectb",
            "api::news-and-events.news-and-events",
        ],

        map_entity: [
            {
                passed: "api::projectb.projectb",
                original_entity: "api::project.project",
                filters: {
                    ParentPages: {
                        PageType: "business-project-listing",
                    },
                },
            },

            {
                passed: "api::news-and-events.news-and-events",
                original_entity: "api::news-item.news-item",
            },

            {
                passed: "api::news-and-events.news-and-events",
                original_entity: "api::event.event",
            },
        ],

        final_count: {
            all: 0,
            "api::vacancy.vacancy": 0,
            "api::event.event": 0,
            "api::project.project": 0,
            "api::projectb.projectb": 0,
            "api::news-and-events.news-and-events": 0,
        },
    },
    default_populate: {
        //in the search result for each entry if you need additional fields to be fetched (relations/components which are not fetched by default findMany)
        //   PageSlug: true,
        //   Image: true,
        // ParentPage: true,
    },
    custom_populate: [
        {
            name: "api::project.project",
            populate: {
                ParentPages: {
                    fields: ["PageTitle", "PageURL", "PageType"],
                    populate: {
                        ParentPage: {
                            fields: ["PageTitle", "PageURL"],
                            populate: {
                                ParentPage: {
                                    fields: ["PageTitle", "PageURL"],
                                },
                            },
                        },
                    },
                },
            },
        },
        {
            name: "api::projectb.projectb",
            populate: {
                ParentPages: {
                    fields: ["PageTitle", "PageURL", "PageType"],
                    populate: {
                        ParentPage: {
                            fields: ["PageTitle", "PageURL"],
                            populate: {
                                ParentPage: {
                                    fields: ["PageTitle", "PageURL"],
                                },
                            },
                        },
                    },
                },
            },
        },
        {
            name: "api::news-item.news-item",
            populate: {
                ParentPage: {
                    fields: ["PageTitle", "PageURL", "PageType"],
                    populate: {
                        ParentPage: {
                            fields: ["PageTitle", "PageURL"],
                            populate: {
                                ParentPage: {
                                    fields: ["PageTitle", "PageURL"],
                                },
                            },
                        },
                    },
                },
            },
        },
        {
            name: "api::news-and-events.news-and-events",
            populate: {
                ParentPage: {
                    fields: ["PageTitle", "PageURL", "PageType"],
                    populate: {
                        ParentPage: {
                            fields: ["PageTitle", "PageURL"],
                            populate: {
                                ParentPage: {
                                    fields: ["PageTitle", "PageURL"],
                                },
                            },
                        },
                    },
                },
            },
        },
        {
            name: "api::vacancy.vacancy",
            populate: {
                ParentPage: {
                    fields: ["PageTitle", "PageURL", "PageType"],
                    populate: {
                        ParentPage: {
                            fields: ["PageTitle", "PageURL"],
                            populate: {
                                ParentPage: {
                                    fields: ["PageTitle", "PageURL"],
                                },
                            },
                        },
                    },
                },
            },
        },
    ],
    auto_complete: {
        search_by: "startswith",
        //contains or startswith , default is startswith
    },
    sync_entities: [
        "api::vacancy.vacancy",
        "api::event.event",
        "api::project.project",
        "api::news-item.news-item",
    ],
};
