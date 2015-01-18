module.exports = function users(app) {
    var express = require('express');
    var path = require('path');
    var router = express.Router();
    var pkg = require('../package');
    var logger = require('../config/logger');
    var fileExtension = require('../config/file-extension');

    // Load mongoose database models here.
    var Person = require('../models/users');

    var getUsers = function (req, res, next) {
        // Load a bunch of users.
        var extension = fileExtension(req);

        Person.find({  }).where('features.senderNumSent').gt(11).exec(function (err, users) {
            logger.info('# users with > 11 senderNumSent: %s', JSON.stringify(users.length));

            if (extension === 'json') {
                res.jsonp(users);
            } else {
                var records = {
                    users: users
                };

                res.render('users', { title: 'Users', package: pkg, records: records });
            }
        });
    };
    var getUserByFilter = function (req, res, next) {
        // Load a specific user.
        var userId = req.params.userId;
        var extension = fileExtension(req);

        Person.find({ 'person.id': userId }).exec(function (err, users) {
            if (extension === 'json') {
                res.jsonp(users);
            } else {
                var records = {
                    users: users
                };

                res.render('users', { title: 'Users', package: pkg, records: records });
            }
        });

    };

    router.param('userId', function (req, res, next, param) {
        var userId = param.match(/^(-[\w]+)(\.json)?$/);

        if (userId && userId.length > 0) {
            req.params.userId = userId[1];
        } else {
            req.params.userId = param;
        }
        next();
    });

    router.use(function (req, res, next) {
        logger.info('making %s request to %s (%s)', req.method, req.url, req.originalUrl);

        next();
    });

    router.get('/', getUsers);
    router.get('/test', function (req, res, next) {
        res.send('response for /users/test');
    });
    router.get('/:userId', getUserByFilter);
    router.get('/:userId(.json)?', getUserByFilter);

    app.use('/users(.json)?', router);
};