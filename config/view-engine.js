module.exports = function viewEngine(app) {
    var path = require('path');
    var logger = require('../config/logger');
    var exphbs = require('express-handlebars');

    /*---------------------------------------------------------------------------*/
    // Add and configure Handlebars support.
    // https://github.com/ericf/express-handlebars
    // https://github.com/ericf/express-handlebars/tree/master/examples
    /*---------------------------------------------------------------------------*/

    app.engine('hbs', exphbs({
        extname: '.hbs',
        defaultLayout: 'main',
        layoutsDir: '../views/layouts',
        partialsDir: '../views/partials',
        helpers: {
            dateFormat: function (context, block) {
                var f = block.hash.format || dates.isoDate;
                return moment(context).format(f);
            }
        }
    }));

    // view engine setup
    app.set('views', path.join(__dirname, '../views'));
    app.set('view engine', 'hbs'); // 'ejs'
    app.set('view options', { layouts: null });

    logger.info('View engine %s has been configured.', 'hbs');

};
