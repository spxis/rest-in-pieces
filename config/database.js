module.exports = function (app) {
    var env = process.env.NODE_ENV || 'development';
    var config = require('../config/config')[env];
    var logger = require('../config/logger');
    var mongoose = require('mongoose');
    var util = require('util');

    var dbName = process.env.DB_NAME || config.dbName;
    var dbLocation = process.env.DB_LOCATION || config.dbLocation;
    var dbPort = process.env.DB_PORT || config.dbPort;
    var dbUser = process.env.DB_USER || config.dbUser;
    var dbPassword = process.env.DB_PASSWORD || config.dbPassword;
    var dbUri = (dbUser) ?
        util.format('mongodb://%s:%s@%s:%s/%s', dbUser, dbPassword, dbLocation, dbPort, dbName) :
        util.format('mongodb://%s:%s/%s', dbLocation, dbPort, dbName);

    if (config.enableDatabase) {
        logger.info('Connecting to %s via mongoose.', dbUri);

        mongoose.connect(dbUri, function (err, res) {
            if (err) {
                logger.info('Error connecting to %s. %s', dbUri, JSON.stringify(err));
            } else {
                logger.info('Succeeded connecting to %s.', dbUri);
            }
        });
    } else {
        logger.warn('Connection to %s via mongoose has NOT been enabled.', dbUri);
    }

    // TODO: Handle 'error' state.
    // db.on('error', function (err) {
        // logger.error(err);
    // });

    // TODO: Handle 'disconneted' state.
    // db.on('disconnected', function () {
        // mongoConnect();
    // });

    return(mongoose);
};