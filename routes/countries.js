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

    var countries = require('country-data').countries;
    var currencies = require('country-data').currencies;
    var regions = require('country-data').regions;
    var languages = require('country-data').languages;

    var defaultMaxRecords = 1000;
    var defaultLimit = 10;
    var defaultOffset = 0;
    var defaultResultsName = 'results';

    var getCountries = function (req, res, next) {
        res.jsonp(countries.all);
        return;
    };

    router.get('/', getCountries);

    app.use('/countries', router);
};