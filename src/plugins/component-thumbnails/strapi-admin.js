"use strict";

import injections from "./admin/src/injections.js";
import pluginId from "./admin/src/pluginId.js";

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

        console.log("Main admin bootstrap running");

        const style = document.createElement("style");
        style.innerHTML = `
      /* Custom thumbnail styles */
      .custom-component-thumbnail {
        width: 32px !important;
        height: 32px !important;
        object-fit: contain;
        display: inline-block;
        flex-shrink: 0;
        vertical-align: middle;
      }
      
      [data-strapi-component-uid] .custom-component-thumbnail {
        margin-right: 8px;
      }
      
      [class*="ComponentCard"] .custom-component-thumbnail,
      [class*="ComponentBox"] .custom-component-thumbnail,
      [class*="ComponentItem"] .custom-component-thumbnail {
        margin-right: 12px;
      }
      
      div[role="region"] button .custom-component-thumbnail {
        vertical-align: middle;
        width: 100% !important;
        height: 100% !important;
      }
      
      .custom-component-thumbnail {
        pointer-events: none;
        user-select: none;
      }

      /* ===== DYNAMIC ZONE GRID CUSTOMIZATION ===== */
      
      /* Component picker modal (when adding components) */
      div[role="region"] > div {
        grid-template-columns: repeat(auto-fill, minmax(35rem, 1fr)) !important;
        gap: 1.5rem !important;
      }

      div[role="region"] > div > button > div > div {
            width: 350px;
            height: 200px;
            background: #000;
            border-radius: 0;
        }
        div[role="region"] .cEHuIJ {
            gap: 24px;
        }
      div[role="region"] > div > button {
            height: 28.4rem;
        }
      
      /* Dynamic zone component list (already added components) */
      [class*="DynamicZone"] [class*="ComponentList"],
      [class*="DynamicZone"] > div > div {
        grid-template-columns: repeat(auto-fill, 37rem) !important;
        gap: 1rem !important;
      }
      
      /* Generic override for any grid with 14rem */
      div[style*="grid-template-columns: repeat(auto-fill, 14rem)"] {
        grid-template-columns: repeat(auto-fill, 37rem) !important;
      }
      
      /* Ensure component cards have appropriate width */
      [class*="ComponentCard"],
      [class*="ComponentBox"] {
        min-width: 35rem;
        max-width: 37rem;
      }
    `;
        document.head.appendChild(style);

        console.log("Custom styles applied");
    },

    async registerTrads({ locales }) {
        // Return empty translations for each locale
        const importedTrads = await Promise.all(
            locales.map((locale) => {
                return {
                    data: {},
                    locale,
                };
            })
        );

        return Promise.resolve(importedTrads);
    },
};

export default plugin;
