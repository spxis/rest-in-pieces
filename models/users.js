var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var personSchema = new Schema({
        person: {
            emailAddress: 'String',
            id: 'Number'
        },
        features: {
            senderAvgKwCount: 'Number',
            senderAvgLength: 'Number',
            senderNumSent: 'Number',
            senderNumReceived: 'Number'
        }
    }
);

module.exports = mongoose.model('Person', personSchema, 'users');
