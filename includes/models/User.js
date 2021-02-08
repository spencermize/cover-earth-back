/* eslint-disable @typescript-eslint/no-var-requires */
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const User = new Schema({
	first: String,
	last: String,
	strava: {
		last: Date,
		access: String,
		refresh: String,
		id: String,
		profile: {}
	}
});

module.exports = User;