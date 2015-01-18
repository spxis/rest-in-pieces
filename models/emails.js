var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var emailSchema = new Schema({
        email_id: 'Number',
        email: {
            sender: 'String',
            subject: 'String',
            sentTime: 'Number',
            body: 'String',
            recipients: {
                recipient: 'String'
            }
        },
        features: {
            subjectKwCount: 'Number',
            bodyKwCount: 'Number',
            bodyLength: 'Number',
            numRecipients: 'Number',
            bodyAndSubjKWCount: 'Number'
        }
    }
);

module.exports = mongoose.model('Email', emailSchema, 'emails');
