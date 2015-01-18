var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var edgeSchema = new Schema({
    srcId: 'Number',
    destId: 'Number',
    type: 'String',
    id: 'Number'
});

module.exports = mongoose.model('Edge', edgeSchema, 'edges');
