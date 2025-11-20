import injections from "./injections";
import pluginId from "./pluginId";

const plugin = {
    register(app) {
        app.registerPlugin({
            id: pluginId,
            initializer: () => null,
            isReady: true,
            name: pluginId,
        });

        console.log(`[${pluginId}] Plugin registered`);
    },

    bootstrap(app) {
        console.log(`[${pluginId}] Plugin bootstrap started`);

        // Wait for DOM to be ready
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => {
                console.log(`[${pluginId}] DOM ready, initializing injections`);
                injections();
            });
        } else {
            console.log(
                `[${pluginId}] DOM already ready, initializing injections`
            );
            injections();
        }
    },
};

export default plugin;
