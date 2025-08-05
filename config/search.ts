/**
 * Configuration interface for search entities
 * Defines the structure for each searchable content type
 */
interface SearchEntity {
  /** The API name of the content type (e.g., "api::faq.faq") */
  name: string;
  /** Fields to search within for text content */
  fields: string[];
  /** The field to use as the title in search results and autocomplete */
  title: string;
  /** Optional filters to limit which entries are searchable */
  filters?: Record<string, boolean>;
  /** Optional populate configuration for relations and components */
  populate?: Record<string, any>;
}

/**
 * Main search configuration interface
 * Defines the complete structure for the search system
 */
interface SearchConfig {
  /** Enable/disable search filters functionality */
  search_filters: boolean;
  /** Array of searchable entities/content types */
  entities: SearchEntity[];
  /** Mapping configuration for search organization */
  map: {
    /** List of searchable entity names */
    others: string[];
    /** Special mapping entities (if any) */
    map_entity: string[];
    /** Counter for tracking search results by type */
    final_count: Record<string, number>;
  };
  /** Default fields to populate in search results across all entities */
  default_populate: Record<string, boolean>;
  /** Custom populate configurations for specific use cases */
  custom_populate: string[];
  /** Autocomplete behavior configuration */
  auto_complete: {
    /** Search matching strategy: "startswith" for prefix matching, "contains" for substring matching */
    search_by: "startswith" | "contains";
  };
  /** Entities to keep synchronized with the search index */
  sync_entities: string[];
}

/**
 * Search Configuration
 * This configuration defines how the search functionality works across different content types
 */
const searchConfig: SearchConfig = {
  // Enable search filters to allow filtered search results
  search_filters: true,

  // Define which content types are searchable and how they should be searched
  entities: [
    {
      name: "api::sitemap.sitemap",
      fields: ["PageTitle"], // Only search within these specific fields
      title: "PageTitle", // Use PageTitle as the display title in search results
    },
    {
      name: "api::faq.faq",
      fields: ["PageTitle"], // Limit search to these fields for better performance
      title: "PageTitle", // Primary field for autocomplete suggestions
      filters: {
        // Only include entries where SearchPage is true in search results
        SearchPage: true,
      },
    },
  ],

  // Search result organization and mapping
  map: {
    // List of all searchable entities
    others: ["api::sitemap.sitemap", "api::faq.faq"],
    // Special mapping entities (empty in this configuration)
    map_entity: [],
    // Counters for tracking search results by type
    final_count: {
      all: 0, // Total count across all types
      "api::sitemap.sitemap": 0,
      "api::faq.faq": 0,
    },
  },

  // Fields to automatically populate in search results for all entities
  // These are additional fields fetched beyond the basic search fields
  default_populate: {
    PageURL: true, // Include page slug for URL generation
    Image: true, // Include associated images
    ParentPage: true, // Include parent page relationships
  },

  // Custom populate configurations (empty in this setup)
  custom_populate: [],

  // Autocomplete behavior configuration
  auto_complete: {
    search_by: "startswith", // Match from the beginning of words (alternative: "contains")
  },

  // Entities that should be kept synchronized with the search index
  sync_entities: ["api::sitemap.sitemap", "api::faq.faq"],
};

export default searchConfig;

/**
 * ========================================
 * CONFIGURATION EXAMPLES
 * ========================================
 */

/**
 * Example 1: Search inside component configurations
 * Use this when you need to search within component fields
 */
/*
entities: [
  {
    name: "api::sitemap.sitemap",
    fields: ["PageTitle", "ShortDescription"],
    title: "PageTitle",
    populate: {
      // Populate a specific component to access its fields
      componentname: {
        populate: {
          Description: true,
          Content: true,
          // Add other component fields as needed
        }
      }
    }
  }
]
*/

/**
 * Example 2: Search inside dynamic zone configurations
 * Use this for content that uses Strapi's dynamic zones feature
 */
/*
entities: [
  {
    name: "api::sitemap.sitemap",
    fields: ["PageTitle", "ShortDescription"],
    title: "PageTitle",
    populate: {
      // Dynamic zone with multiple component types
      dynamiczone: {
        on: {
          // Specify each component type in the dynamic zone
          'blocks.content-block': {
            populate: {
              Description: true,
              Title: true,
            }
          },
          'blocks.image-block': {
            populate: {
              Image: true,
              Caption: true,
            }
          },
          'blocks.text-block': {
            populate: {
              Content: true,
            }
          }
        }
      }
    }
  }
]
*/

/**
 * Example 3: Advanced filtering with multiple conditions
 * Use this for complex search filtering requirements
 */
/*
entities: [
  {
    name: "api::faq.faq",
    fields: ["PageTitle", "ShortDescription", "Content"],
    title: "PageTitle",
    filters: {
      // Multiple filter conditions
      SearchPage: true,
      Published: true,
      Featured: true,
      // You can also use comparison operators
      // Price: { $gte: 0 }, // Price greater than or equal to 0
    },
    populate: {
      Category: true,
      Tags: true,
      Image: {
        populate: {
          url: true,
          alternativeText: true,
        }
      }
    }
  }
]
*/

/**
 * Example 4: Relation-based search configuration
 * Use this when you need to search within related content
 */
/*
entities: [
  {
    name: "api::article.article",
    fields: ["Title", "Summary", "Content"],
    title: "Title",
    populate: {
      // Populate single relation
      Author: {
        populate: {
          Name: true,
          Bio: true,
        }
      },
      // Populate multiple relations
      Categories: {
        populate: {
          Name: true,
          Description: true,
        }
      },
      // Nested relations
      Comments: {
        populate: {
          Content: true,
          User: {
            populate: {
              Username: true,
            }
          }
        }
      }
    }
  }
]
*/
