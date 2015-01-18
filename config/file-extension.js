var path = require('path');

var extension = function (req) {
    var filename = req.originalUrl;
    var ext = path.extname(filename || '').split('.');

    return (ext[ext.length - 1]);
};

module.exports = extension;
