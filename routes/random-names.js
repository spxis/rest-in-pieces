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
    var defaultSortDirection = 'asc';
    var defaultResultsName = 'results';
    var defaultCountry = 'CA';
    var defaultTimezone = 'America/Los_Angeles';
    var defaultTimeFormat = 'x';
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
    var checkSort = function (parameters, sortBy, sortDirection) {
        var regex = /^\s*([\w-]+)\s*(?::([\w-]*))?\s*$/;
        var matches = regex.exec(sortBy);

        if (sortBy && matches) {
            parameters.sortBy = matches[1];
            parameters.sortType = matches[2] || null;
        } else if (sortBy) {
            parameters.sortBy = sortBy;
            parameters.sortType = null;
        } else {
            parameters.sortBy = null;
            parameters.sortType = null;
        }

        parameters.sortDirection = sortDirection || defaultSortDirection;

        if (sortDirection === 'backwards' || sortDirection === 'rev' || sortDirection === 'reverse' ||
            sortDirection === 'desc' || sortDirection === 'descending' ||
            sortDirection === '-1' || sortDirection === -1) {
            parameters.sortDirection = 'desc';
        } else {
            parameters.sortDirection = 'asc';
        }

        if (parameters.sortType === 'int' || parameters.sortType === 'integer' ||
            parameters.sortType === 'num' || parameters.sortType === 'number' || parameters.sortType === 'numeric' ||
            parameters.sortType === 'double' || parameters.sortType === 'float') {
            parameters.sortType = 'numeric';
        } else {
            parameters.sortType = 'string';
        }
    };
    var sortArray = function (array, sortBy, sortDirection, sortType) {
        var sortedArray = array;

        if (sortBy) {
            if (sortType === 'numeric') {
                // FIX THIS BUG PLEASE
                // For some reason, I cannot get this simple numeric sort on strings working.
                sortedArray = array.sort(array, function (a, b) {
                    return (parseFloat(a[sortBy]) > parseFloat(b[sortBy]) ? 1 : -1);
                });
            } else {
                sortedArray = _.sortBy(array, function (user) {
                    return (user[sortBy]);
                });
            }
        }

        if (sortDirection === 'desc') {
            sortedArray = sortedArray.reverse();
        }

        return (sortedArray);
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
            name.country = defaultCountry;
            name.gender = gender.toLowerCase();

            names.push(name);
        }
        return (names);
    };

    var getNames = function (req, res, next) {
        var size = (req.query.size || req.query.length || req.query.limit) || defaultLimit;
        var offset = req.query.offset || defaultOffset;
        var sortBy = req.query.sortby || req.query.sortBy || req.query.sortfield || req.query.sortField;
        var sortDirection = req.query.sortorder || req.query.sortOrder || req.query.sortdirection || req.query.sortDirection;
        var max = req.query.max || req.query.maxRecords || defaultMaxRecords;
        var resultsName = req.query.resultsName || defaultResultsName;
        var showMetadata = !(req.query.metadata && (req.query.metadata === '0' || req.query.metadata === 'false'));
        var sortedData = [];

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

        // If there's no data, build the list of names first.
        if (!names || names.length < 1) {
            names = buildNames(metadata.total);
            metadata.lastUpdated = moment().tz(defaultTimezone).format();
            metadata.timestamp = moment(metadata.lastUpdated).format(defaultTimeFormat);
        }

        // Be sure to sort before chopping up any array.
        sortedData = _.map(names, _.clone);
        checkSort(parameters, sortBy, sortDirection);

        if (parameters.sortBy && parameters.sortDirection) {
            logger.info('Sorting by array field: %s in direction: %s', parameters.sortBy, parameters.sortDirection);
            sortedData = sortArray(sortedData, parameters.sortBy, parameters.sortDirection, parameters.sortType);
        } else if (parameters.sortDirection) {
            logger.info('Sorting in direction: %s', parameters.sortDirection);
            sortedData = sortArray(sortedData, parameters.sortBy, parameters.sortDirection, parameters.sortType);
        }

        logger.info('Original object: [%s] %s vs sorted: [%s] %s',
            names[0].index, names[0].name, sortedData[0].index, sortedData[0].name);

        metadata.parameters = parameters;

        var json = {
            metadata: metadata,
            results: sortedData
        };

        // Modify the resultant output for results customization.
        if (resultsName && resultsName.length > 0 && resultsName !== 'metadata' && resultsName !== defaultResultsName) {
            logger.info ('Going to rename the results to "%s".', resultsName);
            json = renameProperty(json, defaultResultsName, resultsName);
            metadata.output.results = resultsName;
        }

        // Trim the resulting array.
        if (size) {
            // Return a subset of the names.
            logger.info('Return up to %s names at offset %s.', size, offset);
            if (max && max.length > 0) {
                // When max is provided, alter the maxRecords value being sent out.
                // Max is often used to simulate a smaller dataset than requested.
                json[resultsName] = trimArray(chopArray(sortedData, max), size, offset);
            } else {
                // Don't alter the records and leave as-is.
                json[resultsName] = trimArray(sortedData, size, offset);
            }

            json.metadata.count = json[resultsName].length;
            res.jsonp(showMetadata ? json : json[resultsName]);
            return;
        }

        // Return all names.
        logger.info('Return all names.');
        json[resultsName] = sortedData;
        json.metadata.count = sortedData.length;
        res.jsonp(showMetadata ? json : json[resultsName]);
    };

    router.get('/', getNames);

    app.use('/names', router);
    app.use('/random-names', router);
};