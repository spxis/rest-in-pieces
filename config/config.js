module.exports = {
    development: {
        env: 'development',
        serverUri: 'http://localhost', /* Website location for information only */
        serverPort: 8080,
        enableDatabase: false, /* When true, starts the Mongoose database connection */
        dbLocation: 'localhost',
        dbName: 'db-dev',
        dbPort: 27017,
        dbUser: null,
        dbPassword: null,
        logsDir: '../logs',
        sessionExpiry: 60 * 60, /* Number of seconds before expiry of session */
        sessionSecret: 'beansession', /* Name of session secret */
        processTitle: 'bean-dev',
        cookieName: 'beancookie', /* Name of cookie the application */
        contextFolder: '' /* start with a slash */,
        virtualDirectory: '/dir' /* start with a slash */
    },
    staging: {
        env: 'staging',
        serverUri: 'http://localhost', /* Website location for information only */
        serverPort: 8088,
        enableDatabase: false, /* When true, starts the Mongoose database connection */
        dbLocation: 'localhost',
        dbName: 'db-staging',
        dbPort: 27017,
        dbUser: null,
        dbPassword: null,
        logsDir: '../logs',
        sessionExpiry: 60 * 60, /* Number of seconds before expiry of session */
        sessionSecret: 'beansession', /* Name of session secret */
        processTitle: 'bean-staging',
        cookieName: 'beancookie', /* Name of cookie the application */
        contextFolder: '' /* start with a slash */,
        virtualDirectory: '/dir' /* start with a slash */
    },
    production: {
        env: 'production',
        serverUri: 'https://localhost', /* Website location for information only */
        serverPort: 80,
        enableDatabase: false, /* When true, starts the Mongoose database connection */
        dbLocation: 'localhost',
        dbName: 'db-prod',
        dbPort: 27017,
        dbUser: null,
        dbPassword: null,
        logsDir: '../logs',
        sessionExpiry: 60 * 60, /* Number of seconds before expiry of session */
        sessionSecret: 'beansession', /* Name of session secret */
        processTitle: 'bean-prod',
        cookieName: 'beancookie', /* Name of cookie the application */
        contextFolder: '' /* start with a slash */,
        virtualDirectory: '/dir' /* start with a slash */
    }
};
