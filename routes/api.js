/* eslint-disable @typescript-eslint/no-var-requires */
const express = require('express');
const router = express.Router();

const usersRouter = require('./users');
const locationsRouter = require('./locations');

router.use('/users', usersRouter);
router.use('/locations', locationsRouter);

/* GET home page. */
router.get('/', function(req, res, next) {
  res.json("you're in the api now")
});

module.exports = router;
