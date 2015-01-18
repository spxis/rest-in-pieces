module.exports = function root(app) {
    var express = require('express');
    var router = express.Router();
    var pkg = require('../package');

    router.get('/', function (req, res) {
        res.render('index', { title: pkg.displayName, package: pkg });
    });

    app.use('/', router);
};