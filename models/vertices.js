var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var verticeSchema = new Schema({
    type: 'String',
    id: 'Number'
});

module.exports = mongoose.model('Vertice', verticeSchema, 'vertices');
