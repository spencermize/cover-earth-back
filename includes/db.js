/* eslint-disable @typescript-eslint/no-var-requires */
const mongoose = require('mongoose');
class DB {
	async connect() {
		console.log('connecting to db');
		const conn = await mongoose.connect(process.env.MONGODB_URI, {
			useNewUrlParser: true,
			useUnifiedTopology: true,
			useFindAndModify: false
		});

		console.log('connected to db');
		return conn;
	}
}

const db = new DB;
module.exports = db;