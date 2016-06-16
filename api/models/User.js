/**
 * User.js
 *
 * @description :: TODO: You might write a short summary of how this model works and what it represents here.
 * @docs        :: http://sailsjs.org/documentation/concepts/models-and-orm/models
 */

//TODO: Avoid creating the a new user with the same email

module.exports = {

  attributes: {
    email: {
      type: 'string',
      required: true
    },
    password: {
      type: 'string',
      required: true
    }

    // // e.g., "cm"
    // wingspanUnits: {
    //   type: 'string',
    //   enum: ['cm', 'in', 'm', 'mm'],
    //   defaultsTo: 'cm'
    // },
    //
    // // e.g., [{...}, {...}, ...]
    // knownDialects: {
    //   collection: 'Dialect'
    // }
  }
};
