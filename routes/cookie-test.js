module.exports = function root(app) {
    var express = require('express');
    var router = express.Router();

    // Simple set of links to show you how a cookie is read and written on the server-side, using a simple
    // Remember Me type of application.

    router.get('/', function (req, res) {
        if (req.cookies.remember) {
            res.send('Remembered. Click to <a href="/cookie-test/forget">Forget</a>!.');
        } else {
            res.send('<form method="post">' +
                '<p>Check to ' +
                '<label><input type="checkbox" name="remember"/> Remember Me</label> ' +
                '<input type="submit" value="Submit"/>.' +
                '</p>' +
                '</form>');
        }
    });

    router.get('/forget', function (req, res) {
        res.clearCookie('remember');
        res.redirect('back');
    });

    router.post('/', function (req, res) {
        var minute = 60 * 1000;

        if (req.body.remember) {
            res.cookie('remember', 1, { maxAge: minute });
        }
        res.redirect('back');
    });

    app.use('/cookie-test', router);
};