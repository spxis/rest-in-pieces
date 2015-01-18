var path = require('path');
var winston = require('winston');
var maxLogSize = 1 * 1024 * 1024;
var logsDir = '../logs';

var logger = new (winston.Logger)({
    transports: [
        new (winston.transports.Console)({ json: false, timestamp: true, maxsize: maxLogSize, colorize: true }),
        new winston.transports.File({ filename: path.join(__dirname, logsDir, '/logs.log'), json: false, maxsize: maxLogSize })
    ],
    exceptionHandlers: [
        new (winston.transports.Console)({ json: false, timestamp: true, maxsize: maxLogSize, colorize: true }),
        new winston.transports.File({ filename: path.join(__dirname, logsDir, '/exceptions.log'), json: false, maxsize: maxLogSize })
    ],
    exitOnError: false
});

module.exports = logger;