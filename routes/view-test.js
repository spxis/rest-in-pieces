module.exports = function test(app) {
    var express = require('express');
    var router = express.Router();
    var pkg = require('../package');

    router.get('/', function (req, res) {
        res.render('test', { title: 'Test', package: pkg });
    });

    app.use('/view-test', router);
};