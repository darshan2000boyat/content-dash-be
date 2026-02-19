import { getThumbnails } from "./utils/getThumbnails.js";

const injections = () => {
    if (window.thumbnailReplacementActive) {
        // console.log("[Thumbnails] Already active, skipping initialization");
        return;
    }
    window.thumbnailReplacementActive = true;

    // console.log("[Thumbnails] Initializing component thumbnail replacement");

    const initThumbnails = async () => {
        try {
            const thumbnails = await getThumbnails();
            window.componentThumbnails = thumbnails;

            // console.log(
            //     "[Thumbnails] Component thumbnails loaded:",
            //     thumbnails
            // );
            // console.log(
            //     `[Thumbnails] Total thumbnails: ${
            //         Object.keys(thumbnails).length
            //     }`
            // );

            // Object.entries(thumbnails).forEach(([uid, url]) => {
            //     console.log(`[Thumbnails] ${uid} -> ${url}`);
            // });

            setTimeout(() => {
                // console.log("[Thumbnails] Starting initial replacement...");
                replaceThumbnails();
            }, 1000);
        } catch (error) {
            console.error(
                "[Thumbnails] Failed to initialize thumbnails:",
                error
            );
        }
    };

    const replaceIcon = (svg, thumbnailUrl, componentUid) => {
        if (!svg || !svg.parentElement) {
            return;
        }

        if (svg.parentElement.querySelector(".custom-component-thumbnail")) {
            return;
        }

        // console.log(
        //     `[Thumbnails] Replacing icon for ${componentUid} with ${thumbnailUrl}`
        // );

        const img = document.createElement("img");
        img.src = thumbnailUrl;
        img.className = "custom-component-thumbnail";
        img.alt = `${componentUid} thumbnail`;
        img.title = componentUid;
        img.setAttribute("data-component-uid", componentUid);

        //     img.style.cssText = `
        //   object-fit: cover;
        //   flex-shrink: 0;
        //   display: inline-block;
        // `;

        // img.onerror = () => {
        //     console.error(
        //         `[Thumbnails] Failed to load thumbnail for ${componentUid}: ${thumbnailUrl}`
        //     );
        // };

        // img.onload = () => {
        //     console.log(
        //         `[Thumbnails] ✓ Thumbnail loaded successfully for ${componentUid}`
        //     );
        // };

        try {
            svg.parentElement.replaceChild(img, svg);
            // console.log(`[Thumbnails] ✓ Replaced SVG for ${componentUid}`);
        } catch (error) {
            console.error(
                `[Thumbnails] Error replacing SVG for ${componentUid}:`,
                error
            );
        }
    };

    // Normalize text for comparison (remove special chars, extra spaces, etc.)
    const normalizeText = (text) => {
        return text
            .toLowerCase()
            .replace(/[&\-_]/g, " ") // Replace &, -, _ with space
            .replace(/\s+/g, " ") // Replace multiple spaces with single space
            .trim();
    };

    const replaceByUid = (element) => {
        const componentUid = element.getAttribute("data-strapi-component-uid");

        if (!componentUid) {
            return;
        }

        // console.log(`[Thumbnails] Found element with UID: ${componentUid}`);

        if (window.componentThumbnails?.[componentUid]) {
            const thumbnail = window.componentThumbnails[componentUid];
            // console.log(
            //     `[Thumbnails] Found thumbnail for ${componentUid}: ${thumbnail}`
            // );

            const svgIcons = element.querySelectorAll("svg");
            // console.log(
            //     `[Thumbnails] Found ${svgIcons.length} SVG icons in element`
            // );

            svgIcons.forEach((svg, index) => {
                replaceIcon(svg, thumbnail, componentUid);
            });
        } else {
            console.log(`[Thumbnails] No thumbnail found for ${componentUid}`);
        }
    };

    const replaceInPicker = () => {
        if (!window.componentThumbnails) {
            // console.log(
            //     "[Thumbnails] No thumbnails available for picker replacement"
            // );
            return;
        }

        // console.log(
        //     "[Thumbnails] Attempting to replace in component picker..."
        // );

        Object.entries(window.componentThumbnails).forEach(
            ([uid, thumbnail]) => {
                // Extract component name from UID (e.g., "blocks.awards-and-recognations" -> "awards-and-recognations")
                const componentFileName = uid.split(".").pop();

                if (!componentFileName) return;

                // Create multiple possible name variations
                const nameVariations = [
                    componentFileName, // awards-and-recognations
                    componentFileName.replace(/-/g, " "), // awards and recognations
                    componentFileName.replace(/-/g, ""), // awardsandrecognations
                    componentFileName.replace(/-and-/g, " & "), // awards & recognations
                    componentFileName.split("-").join(" "), // awards and recognations
                ];

                // console.log(`[Thumbnails] Looking for component: ${uid}`);
                // console.log(`[Thumbnails] Name variations:`, nameVariations);

                // Comprehensive selectors
                const selectors = [
                    // 'div:not(.dynamiczone-row) [class*="ComponentCard"]',
                    // 'div:not(.dynamiczone-row) [class*="ComponentBox"]',
                    // 'div:not(.dynamiczone-row) [class*="ComponentItem"]',
                    // 'div:not(.dynamiczone-row) [class*="ComponentPicker"]',
                    // 'div:not(.dynamiczone-row) [class*="PickerButton"]',
                    // 'div:not(.dynamiczone-row) [class*="Component"]',
                    // 'div:not(.dynamiczone-row) [role="button"]',
                    'div[role="tabpanel"] button[type="button"]',
                    'div[role="region"] button[type="button"]',
                    // "div:not(.dynamiczone-row) button",
                    // "div:not(.dynamiczone-row) [data-strapi-component]",
                ];

                const elements = document.querySelectorAll(
                    selectors.join(", ")
                );

                // console.log("elements", elements);

                elements.forEach((el) => {
                    const textContent = normalizeText(el.textContent || "");
                    const ariaLabel = normalizeText(
                        el.getAttribute("aria-label") || ""
                    );
                    const title = normalizeText(el.getAttribute("title") || "");
                    const dataComponent = normalizeText(
                        el.getAttribute("data-strapi-component") || ""
                    );

                    // Check if any variation matches
                    const matches = nameVariations.some((variation) => {
                        const normalizedVariation = normalizeText(variation);
                        return (
                            textContent.includes(normalizedVariation) ||
                            ariaLabel.includes(normalizedVariation) ||
                            title.includes(normalizedVariation) ||
                            dataComponent.includes(normalizedVariation)
                        );
                    });

                    if (matches) {
                        // console.log(
                        //     `[Thumbnails] Match found for ${uid} in element:`,
                        //     el
                        // );
                        const svgIcons = el.querySelectorAll("div > svg");
                        // console.log(
                        //     `[Thumbnails] Found ${svgIcons.length} SVG icons to replace`
                        // );

                        svgIcons.forEach((svg) => {
                            replaceIcon(svg, thumbnail, uid);
                        });
                    }
                });
            }
        );
    };

    // Enhanced replacement for dynamic zones
    const replaceInDynamicZones = () => {
        if (!window.componentThumbnails) return;

        // console.log("[Thumbnails] Scanning dynamic zones...");

        // Find all buttons in dynamic zones
        const dynamicZoneSelectors = [
            '[class*="DynamicZone"] button',
            '[class*="ComponentPicker"] button',
            '[class*="DynamicComponent"] button',
            'button[class*="Component"]',
        ];

        const buttons = document.querySelectorAll(
            dynamicZoneSelectors.join(", ")
        );
        // console.log(
        //     `[Thumbnails] Found ${buttons.length} buttons in dynamic zones`
        // );

        buttons.forEach((button) => {
            const buttonText = normalizeText(button.textContent || "");

            Object.entries(window.componentThumbnails).forEach(
                ([uid, thumbnail]) => {
                    const componentFileName = uid.split(".").pop();

                    // Create variations
                    const variations = [
                        componentFileName,
                        componentFileName.replace(/-/g, " "),
                        componentFileName.replace(/-and-/g, " & "),
                    ];

                    const matches = variations.some((v) =>
                        buttonText.includes(normalizeText(v))
                    );

                    if (matches) {
                        // console.log(
                        //     `[Thumbnails] Found button for ${uid}:`,
                        //     button
                        // );
                        const svgs = button.querySelectorAll("svg");
                        svgs.forEach((svg) => replaceIcon(svg, thumbnail, uid));
                    }
                }
            );
        });
    };

    const replaceThumbnails = () => {
        if (
            !window.componentThumbnails ||
            Object.keys(window.componentThumbnails).length === 0
        ) {
            // console.log("[Thumbnails] No thumbnails to replace");
            return;
        }

        // console.log("[Thumbnails] Starting thumbnail replacement...");

        // Method 1: Replace by data-strapi-component-uid attribute
        const elementsWithUid = document.querySelectorAll(
            "[data-strapi-component-uid]"
        );
        console.log(
            `[Thumbnails] Found ${elementsWithUid.length} elements with data-strapi-component-uid`
        );
        elementsWithUid.forEach(replaceByUid);

        // Method 2: Replace in component picker
        replaceInPicker();

        // Method 3: Replace in dynamic zones specifically
        // replaceInDynamicZones();

        // console.log("[Thumbnails] Replacement cycle completed");
    };

    // Mutation observer
    const observer = new MutationObserver((mutations) => {
        let shouldReplace = false;

        mutations.forEach((mutation) => {
            if (mutation.addedNodes.length > 0) {
                shouldReplace = true;
            }
        });

        if (shouldReplace) {
            setTimeout(replaceThumbnails, 100);
        }
    });

    if (document.body) {
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: [
                "data-strapi-component-uid",
                "class",
                "aria-label",
                "data-strapi-component",
            ],
        });
        // console.log("[Thumbnails] MutationObserver started");
    }

    // Initialize
    initThumbnails();

    // Initial rapid checks, then slow down
    let checkCount = 0;
    const checkInterval = setInterval(() => {
        replaceThumbnails();
        checkCount++;

        if (checkCount >= 10) {
            clearInterval(checkInterval);
            setInterval(replaceThumbnails, 5000);
            // console.log("[Thumbnails] Switched to slower polling interval");
        }
    }, 2000);

    // Watch for URL changes
    let lastUrl = location.href;
    const urlObserver = new MutationObserver(() => {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
            // console.log(
            //     "[Thumbnails] URL changed, triggering thumbnail replacement"
            // );
            lastUrl = currentUrl;
            setTimeout(replaceThumbnails, 1000);
        }
    });

    urlObserver.observe(document.body, {
        childList: true,
        subtree: true,
    });

    // Manual trigger
    window.triggerThumbnailReplacement = () => {
        // console.log("[Thumbnails] Manual replacement triggered");
        replaceThumbnails();
    };

    // console.log(
    //     "[Thumbnails] Plugin initialized. Use window.triggerThumbnailReplacement() to manually trigger replacement"
    // );
};

export default injections;
