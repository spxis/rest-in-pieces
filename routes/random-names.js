module.exports = function users(app) {
    var express = require('express');
    var path = require('path');
    var moment = require('moment-timezone');
    var router = express.Router();
    var pkg = require('../package');
    var logger = require('../config/logger');
    var _ = require('underscore');
    var Chance = require('chance');
    var chance = new Chance();

    var defaultMaxRecords = 1000;
    var defaultLimit = 10;
    var defaultOffset = 0;
    var defaultResultsName = 'results';
    var names = [];

    var renameProperty = function (object, oldName, newName) {
        // Check for the old property name to avoid a ReferenceError in strict mode.
        if (object.hasOwnProperty(oldName)) {
            object[newName] = object[oldName];
            delete object[oldName];
        }
        return object;
    };

    var trimArray = function (array, size, offset) {
        return (_.first(_.rest(array, offset), size));
    };
    var chopArray = function (array, max) {
        return (_.first(array, max));
    };

    var buildNames = function (maxRecords) {
        logger.info('Building %s names in memory.', maxRecords);
        for (var i = 0; i < maxRecords; i++) {
            var name = {
                index: null,
                name: null,
                age: null,
                address: null,
                city: null,
                province: null,
                country: null,
                gender: null
            };
            var gender = chance.gender();
            var fullName = chance.name({ gender: gender });

            name.index = i;
            name.name = fullName;
            name.age = chance.age();
            name.address = chance.address({short_suffix: false});
            name.city = chance.city();
            name.province = chance.province();
            name.postal = chance.postal();
            name.country = 'CA';
            name.gender = gender.toLowerCase();

            names.push(name);
        }
        return (names);
    };

    var getNames = function (req, res, next) {
        var size = (req.query.size || req.query.length || req.query.limit) || defaultLimit;
        var offset = req.query.offset || defaultOffset;
        var max = req.query.max || req.query.maxRecords || defaultMaxRecords;
        var resultsName = req.query.resultsName || defaultResultsName;
        var showMetadata = !(req.query.metadata && (req.query.metadata === '0' || req.query.metadata === 'false'));

        var metadata = {
            count: null,
            total: defaultMaxRecords,
            timestamp: null,
            lastUpdated: null,
            output: {
                results: defaultResultsName
            },
            version: pkg.version
        };

        var parameters = {
            size: size,
            offset: offset,
            max: max
        };

        if (!names || names.length < 1) {
            names = buildNames(metadata.total);
            metadata.lastUpdated = moment().tz('America/Los_Angeles').format();
            metadata.timestamp = moment(metadata.lastUpdated).format('x');
        }

        metadata.parameters = parameters;

        var json = {
            metadata: metadata,
            results: names
        };

        if (resultsName && resultsName.length > 0 && resultsName !== 'metadata') {
            logger.info ('Going to rename the results to "%s".', resultsName);
            json = renameProperty(json, defaultResultsName, resultsName);
            metadata.output.results = resultsName;
        }

        if (size) {
            // Return a subset of the names.
            logger.info('Return up to %s names at offset %s.', size, offset);
            if (max && max.length > 0) {
                // When max is provided, alter the maxRecords value being sent out.
                // Max is often used to simulate a smaller dataset than requested.
                json[resultsName] = trimArray(chopArray(names, max), size, offset);
            } else {
                // Don't alter the records and leave as-is.
                json[resultsName] = trimArray(names, size, offset);
            }

            json.metadata.count = json[resultsName].length;
            res.jsonp(showMetadata ? json : json[resultsName]);
            return;
        }

        // Return all names.
        logger.info('Return all names.');
        json[resultsName] = names;
        json.metadata.count = names.length;
        res.jsonp(showMetadata ? json : json[resultsName]);
        return;
    };

    router.get('/', getNames);

    app.use('/names', router);
    app.use('/random-names', router);
};