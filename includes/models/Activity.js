/* eslint-disable @typescript-eslint/no-var-requires */
const mongoose = require('mongoose');

const Schema = mongoose.Schema;

const {
  MultiPoint
} = require('mongoose-geojson-schemas');


const Activity = new Schema({
	id: String,
	last: String,
	service: String,
	user: String,
	location: MultiPoint,
	meta: {}
});

module.exports = Activity;