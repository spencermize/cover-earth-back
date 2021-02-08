/* eslint-disable @typescript-eslint/no-var-requires */
const express = require('express');
const router = express.Router();

/* GET users listing. */
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

router.get('/session', function(req, res, next) {
	if (req.user) {
		res.json(true);
	} else {
		res.json(false);
	}
});

module.exports = router;
