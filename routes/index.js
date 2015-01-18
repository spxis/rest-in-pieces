module.exports = function (app) {
    var express = require('express');
    var router = express.Router();
    var logger = require('../config/logger');

    var root = require('./root')(app);
    var names = require('./random-names')(app);
};