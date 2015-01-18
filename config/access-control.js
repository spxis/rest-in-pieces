module.exports = function accessControl(app) {

    /*---------------------------------------------------------------------------*/
    // Set the headers for each request.
    /*---------------------------------------------------------------------------*/

    app.use(function (req, res, next) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Allow-Credentials', true);
        next();
    });

};