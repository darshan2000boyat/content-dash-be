/**
 * Fetch all component thumbnails from component schemas
 */
export const getThumbnails = async () => {
    try {
        const response = await fetch("/component-thumbnails/thumbnails", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data?.data || {};
    } catch (error) {
        console.error("Error fetching component thumbnails:", error);
        return {};
    }
};
