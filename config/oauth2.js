var oauth2orize         = require('oauth2orize'),
    passport            = require('passport'),
    login               = require('connect-ensure-login'),
    bcrypt              = require('bcrypt'),
    trustedClientPolicy = require('../api/policies/isTrustedClient.js');

// Create OAuth 2.0 server
var server = oauth2orize.createServer();

server.serializeClient(function(client, done) {
  return done(null, client.id);
});

server.deserializeClient(function(id, done) {
Client.findOne(id, function(err, client) {
  if (err) { return done(err); }
    return done(null, client);
  });
});

// Generate authorization code
server.grant(oauth2orize.grant.code(function(client, redirectURI, user, ares, done) {
  AuthCode.create({
                    clientId: client.clientId,
                    redirectURI: redirectURI,
                    userId: user.id,
                    scope: ares.scope
                  }).exec(function(err,code){
                    if(err){return done(err,null);}
                    return done(null,code.code);
                  });
}));

// Generate access token for Implicit flow
// Only access token is generated in this flow, no refresh token is issued
server.grant(oauth2orize.grant.token(function(client, user, ares, done) {
  AccessToken.destroy({ userId: user.id, clientId: client.clientId }, function (err) {
    if (err){
      return done(err);
    } else {
      AccessToken.create({ userId: user.id, clientId: client.clientId }, function(err, accessToken){
        if(err) {
          return done(err);
        } else {
          return done(null, accessToken.token);
        }
      });
    }
  });
}));

// Exchange authorization code for access token
server.exchange(oauth2orize.exchange.code(function(client, code, redirectURI, done) {
  AuthCode.findOne({
                     code: code
                   }).exec(function(err,code){
                     if(err || !code) {
                       return done(err);
                     }
                     if (client.clientId !== code.clientId) {
                       return done(null, false);
                     }
                     if (redirectURI !== code.redirectURI) {
                       return done(null, false);
                     }

                     // Remove Refresh and Access tokens and create new ones
                     RefreshToken.destroy({ userId: code.userId, clientId: code.clientId }, function (err) {
                       if (err) {
                         return done(err);
                       } else {
                         AccessToken.destroy({ userId: code.userId, clientId: code.clientId }, function (err) {
                           if (err){
                             return done(err);
                           } else {
                             RefreshToken.create({ userId: code.userId, clientId: code.clientId }, function(err, refreshToken){
                               if(err){
                                 return done(err);
                               } else {
                                 AccessToken.create({ userId: code.userId, clientId: code.clientId }, function(err, accessToken){
                                   if(err) {
                                     return done(err);
                                   } else {
                                     return done(null, accessToken.token, refreshToken.token, { 'expires_in': sails.config.oauth.tokenLife });
                                   }
                                 });
                               }
                             });
                           }
                         });
                       }
                     });

                   });
}));

// Exchange username & password for access token.
server.exchange(oauth2orize.exchange.password(function(client, username, password, scope, done) {
  console.log('Exchange username & password for access token')
    User.findOne({ email: username }, function(err, user) {
        if (err) {
          console.error("Error getting user: ", err);
          return done(err);
        }
        if (!user) {
          console.error("User does not exist:");
          return done(null, false);
        }
        console.log('password: ', password);
        console.log('user.hashedPassword: ', user.hashedPassword);
        var pwdCompare = bcrypt.compareSync(password, user.hashedPassword);
        if(!pwdCompare){ return done( null, false); };

        // Remove Refresh and Access tokens and create new ones
        RefreshToken.destroy({ userId: user.id, clientId: client.clientId }, function (err) {
            if (err) {
              return done(err);
            } else {
              AccessToken.destroy({ userId: user.id, clientId: client.clientId }, function (err) {
                if (err){
                  return done(err);
                } else {
                  RefreshToken.create({ userId: user.id, clientId: client.clientId }, function(err, refreshToken){
                    if(err){
                      return done(err);
                    } else {
                      AccessToken.create({ userId: user.id, clientId: client.clientId }, function(err, accessToken){
                        if(err) {
                          return done(err);
                        } else {
                          done(null, accessToken.token, refreshToken.token,
                            { 'expires_in': sails.config.oauth.tokenLife,
                              'account_id': user.id});
                        }
                      });
                    }
                  });
                }
              });
            }
        });
    });
}));

// Exchange refreshToken for access token.
server.exchange(oauth2orize.exchange.refreshToken(function(client, refreshToken, scope, done) {

    RefreshToken.findOne({ token: refreshToken }, function(err, token) {

        if (err) { return done(err); }
        if (!token) { return done(null, false); }
        if (!token) { return done(null, false); }

        User.findOne({id: token.userId}, function(err, user) {

            if (err) { return done(err); }
            if (!user) { return done(null, false); }

            // Remove Refresh and Access tokens and create new ones
            RefreshToken.destroy({ userId: user.id, clientId: client.clientId }, function (err) {
              if (err) {
                return done(err);
              } else {
                AccessToken.destroy({ userId: user.id, clientId: client.clientId }, function (err) {
                  if (err){
                    return done(err);
                  } else {
                    RefreshToken.create({ userId: user.id, clientId: client.clientId }, function(err, refreshToken){
                      if(err){
                        return done(err);
                      } else {
                        AccessToken.create({ userId: user.id, clientId: client.clientId }, function(err, accessToken){
                          if(err) {
                            return done(err);
                          } else {
                            done(null, accessToken.token, refreshToken.token, { 'expires_in': sails.config.oauth.tokenLife });
                          }
                        });
                      }
                    });
                  }
                });
              }
           });
        });
    });
}));

module.exports = {
 http: {
    customMiddleware: function(app){

      // Initialize passport
      app.use(passport.initialize());
      app.use(passport.session());

      /***** OAuth authorize endPoints *****/

      var allowCrossDomain = function(req, res, next) {
        res.header('Access-Control-Allow-Origin', 'http://localhost:4200');
        res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        // intercept OPTIONS method
        if ('OPTIONS' == req.method) {
          res.send(200);
        }
        else {
          next();
        }
      };
      app.use(allowCrossDomain);

      app.get('/oauth/authorize',
        login.ensureLoggedIn(),
        server.authorize(function(clientId, redirectURI, done) {

          Client.findOne({clientId: clientId}, function(err, client) {
            if (err) { return done(err); }
            if (!client) { return done(null, false); }
            if (client.redirectURI != redirectURI) { return done(null, false); }
            return done(null, client, client.redirectURI);
          });
        }),
        server.errorHandler(),
        function(req, res) {
          res.render('dialog', { transactionID: req.oauth2.transactionID,
                                 user: req.user,
                                 client: req.oauth2.client
          });
        }
      );

      app.post('/login', passport.authenticate('local', { successReturnToOrRedirect: '/', failureRedirect: '/login' }));

      app.post('/oauth/authorize/decision',
        login.ensureLoggedIn(),
        server.decision());

      /***** OAuth token endPoint *****/
      //TODO: move the prefix '/api/v1' to another place. Unify with blueprint
      //if it is possible
      app.post('/api/v1/oauth/token',
        function (req, res, next) {
          console.log('Authenticating user. Flow: User Password Credentials ...');
          next(); // pass control to the next handler
        },
        trustedClientPolicy,
        passport.authenticate(['basic', 'oauth2-client-password'], { session: false }),
        server.token(),
        // server.errorHandler()
        function (err, req, res, next) {
          console.log("Checking errors");
          if (req.xhr) {
            res.status(500).send({ error: 'Something failed!' });
          } else {
            next(err);
          }
        }
      );

    }
 }
};
