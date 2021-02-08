/* eslint-disable @typescript-eslint/no-var-requires */
const mongoose = require('mongoose');
const User = require('../includes/models/User');
const passport = require('passport');
const StravaStrategy = require('passport-strava-oauth2').Strategy;

const express = require('express');
const router = express.Router();

passport.serializeUser(function(user, done) {
	console.log('serializing');
	done(null, user);
});

passport.deserializeUser(function(id, done) {
	const user = mongoose.model('User', User);
	user.findOne({'strava.id': id}, function(err, res){
		done(err,res);
	});
});

passport.use(new StravaStrategy({
    clientID: process.env.STRAVA_CLIENT_ID,
    clientSecret: process.env.STRAVA_CLIENT_SECRET,
    callbackURL: `${process.env.SITE_URL}/auth/strava/callback`
  },
  async function(accessToken, refreshToken, profile, done) {
	const user = mongoose.model('User', User);
	const options = { upsert: true, new: true, setDefaultsOnInsert: true };
	const params = {
		strava: {
			last: Date.now(),
			access: accessToken,
			refresh: refreshToken,
			id: profile.id,
			profile
		}
	}	

	try{
		user.findOneAndUpdate({'strava.id' : profile.id}, params, options, function(){
			console.log('updated');
			return done(null, profile.id);
		});

	} catch (e) {
		console.log(e);
		return done(null, false, {message: 'failed to auth'});
	}
   
  }
));
router.get('/strava/callback', passport.authenticate('strava', { failureRedirect: '/login' }),
	function(req, res) {
		console.log('done');
		res.redirect(process.env.REDIR_URL);
	}
);

router.get('/strava', passport.authenticate('strava', {	scope: ['activity:read_all']}));

router.get('/logout', function(req, res, next) {
	req.session.destroy(function(){
		res.json({success: true});
	});
	
});

const auth = function(req, res, next) {
	try{
		if(req.isAuthenticated && req.user && req.user.strava.access){
			next();
		} else {
			throw new Error('NoAuth');
		}
	} catch (e) {
		res.status(401);
		res.json({message: e.message});
		res.end();
	}

}

module.exports = {
	router,
	auth
}
