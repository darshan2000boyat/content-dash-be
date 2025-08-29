const POPULATE_IMAGE = {
    populate: ["Image", "MobileImage"],
};

const BUTTON = {
    Button: {
        fields: ["Title", "URL", "Target"],
        populate: {
            Icon: true,
        },
    },
};

module.exports = () => {
    return {
        // BUTTON,
        ALL_BLOCKS: {
            "blocks.test-block": {
                populate: {
                    Media: POPULATE_IMAGE,
                    Common: true,
                },
            },
        },
    };
};
