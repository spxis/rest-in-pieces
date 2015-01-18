module.exports = function users(app) {
    var express = require('express');
    var path = require('path');
    var router = express.Router();
    var pkg = require('../package');
    var logger = require('../config/logger');
    var _ = require('underscore');
    var Chance = require('chance');
    var chance = new Chance();

    var totalRecords = 1000;
    var defaultLimit = 10;
    var defaultOffset = 0;
    var names = [];

    var trimArray = function (array, size, offset) {
        return (_.first(_.rest(array, offset), size));
    };

    var buildNames = function (totalRecords) {
        logger.info('Building %s names in memory.', totalRecords);
        for (var i = 0; i < totalRecords; i++) {
            var name = {};
            var gender = chance.gender();

            name.index = i;
            name.age = chance.age();
            name.address = chance.address({short_suffix: false});
            name.city = chance.city();
            name.province = chance.province();
            name.postal = chance.postal();
            name.country = 'CA';
            name.gender = gender;
            name.name = chance.name({ gender: gender });

            names.push(name);
        }
        return (names);
    };

    var getNames = function (req, res, next) {
        var size = (req.query.size || req.query.length || req.query.limit) || defaultLimit;
        var offset = req.query.offset || defaultOffset;

        if (!names || names.length < 1) {
            names = buildNames(totalRecords);
        }

        if (size) {
            // Return a subset of the names.
            logger.info('Return up to %s names at offset %s.', size, offset);
            res.jsonp(trimArray(names, size, offset));
            return;
        }

        // Return all names.
        logger.info('Return all names.');
        res.jsonp(names);
        return;
    };

    router.get('/', getNames);

    app.use('/names', router);
};