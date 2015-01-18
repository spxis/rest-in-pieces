var cookieParser = require('cookie-parser');

module.exports = function cookies(app) {

    app.use(cookieParser(app.get('sessionSecret')));

    //app.use(function (req, res, next) {
    //    res.end(JSON.stringify(req.cookies));
    //});

};