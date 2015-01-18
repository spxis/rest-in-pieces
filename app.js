var path = require('path');
var appDir = process.argv[1];
var dirName = path.dirname(appDir);

process.chdir(dirName);

var env = process.env.NODE_ENV || 'development';
var config = require('./config/config')[env];
var express = require('express');
var favicon = require('serve-favicon');
var pkg = require('./package');
var check = require('./config/check');
var logger = require('./config/logger');
var bodyParser = require('body-parser');
var util = require('util');
var moment = require('moment');

logger.info('Starting %s v%s', pkg.displayName, pkg.version);
logger.info('Process running at "%s"', process.title);

//var params = require('express-params');
var app = express();

// Allow all requests to have the mongoose object.
require('./config/database')(app);
require('./config/view-engine')(app);
require('./config/security')(app);

app.set('cookieName', config.cookieName);
app.set('sessionSecret', config.sessionSecret);

app.use(favicon(path.join(__dirname, 'public/images/favicon.ico')));
//app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

require('./config/cookies')(app);
require('./config/session')(app);
require('./config/access-control')(app);
require('./config/statics')(app);
require('./routes')(app);
require('./config/error-handling')(app);

module.exports = app;
