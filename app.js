'use strict';
 
/* eslint-disable @typescript-eslint/no-var-requires */
// import createError from 'http-errors';
// import express from 'express';
// import cookieParser from 'cookie-parser';
// import logger from 'morgan';
require('dotenv').config();

const PORT = process.env.PORT || 5000

const createError = require('http-errors');
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const session = require("express-session");
const passport = require('passport');
const MongoStore = require('connect-mongo')(session);
const mongoose = require('mongoose');
const db = require('./includes/db');
const apiRouter = require('./routes/api');
const authRouter = require('./routes/auth');
const compression = require('compression');

db.connect();
const app = express();

const corsOptions = {
  origin: ['http://localhost:8080', 'https://thirsty-hoover-dcb557.netlify.app'],
  credentials: true
}
app.use(logger('dev'));
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(compression({
  filter: (req, res) => { return true },
  threshold: 0,
  level: 9
}));

app.use(session({ 
	secret: "hoobidydoo", 
	saveUninitialized: false, 
	resave: true,
	store: new MongoStore({
		mongooseConnection: mongoose.connection
	})
}));

app.use(passport.initialize());
app.use(passport.session());

app.use('/auth', authRouter.router);
app.use('/api', apiRouter);

// app.use(express.static('dist'))


// catch 404 and forward to error handler
app.use(function(req, res, next) {
	if(req.path.includes('api')){
		next(createError(404));
	} 
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  console.log(err.message);
  console.log(err.stack);
  res.status(err.status || 500);
  res.json({ error: err })
});

if (process.env.ENV=='local') {
  app.listen(PORT, () => console.log(`Listening on ${PORT}` ))
} else {
  module.exports = app;
}

