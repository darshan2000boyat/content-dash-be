export default ({env}) => ({
    // ..other plugins
  "strapi-plugin-cron": {
    enabled: true,
  },
  "schema-visualizer": {
    enabled: true,
  },
  "strapi-plugin-dashboard": {
    enabled: true,
  },
  "users-permissions": {
    config: {
      jwt: {
        /* the following  parameter will be used to generate:
             - regular tokens with username and password
             - refreshed tokens when using the refreshToken API
            */
        expiresIn: "1m", // This value should be lower than the refreshTokenExpiresIn below.
      },
    },
  },
  "refresh-token": {
    config: {
      refreshTokenExpiresIn: "2m", // this value should be higher than the jwt.expiresIn
      requestRefreshOnAll: false, // automatically send a refresh token in all login requests.
      refreshTokenSecret: env("REFRESH_JWT_SECRET") || "SomethingSecret",
      cookieResponse: false, // if set to true, the refresh token will be sent in a cookie
      refreshTokenRotation: false, // forces a new Refresh token, deleting the previously used one from the db.
    },
  },
});
