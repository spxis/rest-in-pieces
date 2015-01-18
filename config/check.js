var mkdirp = require('mkdirp');
var logsDir = '../logs';

// Make sure we have a logs directory.
mkdirp(logsDir, function (err) {
    if (err) {
        console.log(err);
    }
});
