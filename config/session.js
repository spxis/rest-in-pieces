var session = require('express-session');
var env = process.env.NODE_ENV || 'development';
var config = require('../config/config')[env];
var logger = require('../config/logger');

module.exports = function security(app) {

    app.use(session({
        name: app.get('cookieName'),
        secret: app.get('sessionSecret'),
        cookie: {
            maxAge: config.sessionExpiry * 1000, // Set to null for no expiration time.
            secure: false // Set this to true if running under HTTPS.
        },
        resave: true,
        saveUninitialized: true
    }));

    /*---------------------------------------------------------------------------*/
    // Allows access to session through HTML/HBS pages.
    /*---------------------------------------------------------------------------*/
    app.use(function (req, res, next) {
        res.locals.session = req.session;
        next();
    });

    logger.info('Sessions have been enabled and expire in %s seconds.', (config.sessionExpiry));

};