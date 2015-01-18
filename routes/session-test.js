module.exports = function root(app) {
    var express = require('express');
    var router = express.Router();

    // Simple set of links to show you how a cookie is read and written on the server-side, using a simple
    // Remember Me type of application.

    router.get('/', function (req, res) {
        var session = req.session;

        if (session.visits) {
            session.visits++;
            res.send('You have visited this site: ' + session.visits + ' times. Session expires ' + (session.cookie.maxAge / 1000) + ' seconds.');
        } else {
            session.visits = 1;
            res.send('Welcome to your first visit! Session expires ' + (session.cookie.maxAge / 1000) + ' seconds.');
        }
    });

    app.use('/session-test', router);
};