module.exports = function statics(app) {
    var express = require('express');
    var path = require('path');
    var env = process.env.NODE_ENV || 'development';
    var config = require('../config/config')[env];
    var logger = require('../config/logger');

    // Static HTML files can be found directly in the "public" directory.
    if (config.contextFolder) {
        app.use(config.contextFolder, express.static(path.join(__dirname, '../public')));
    } else {
        app.use(express.static(path.join(__dirname, '../public')));
    }

    // Expose Angular Controllers.
    app.use('/controllers', express.static(path.join(__dirname, '../controllers')));

    if (app.get('env') !== 'production') {
        // Expose JSON data files for non-production environments.
        app.use('/json', express.static(path.join(__dirname, '../json')));

        // Expose Log files for non-production environments.
        app.use('/logs', express.static(path.join(__dirname, '../logs')));
    }

};