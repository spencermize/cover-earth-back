/* eslint-disable @typescript-eslint/no-var-requires */
const stravaApi = require('strava-v3');
const mongoose = require('mongoose');

const Activity = require('../models/Activity');
const User = require('../models/User');
const turf = require('@turf/turf');
class Strava {
	constructor() {
		this.config();
	}
	setId(id){
		stravaApi.client(id);
	}
	config(){
		stravaApi.config({
			"client_id"     : process.env.STRAVA_CLIENT_ID,
			"client_secret" : process.env.STRAVA_CLIENT_SECRET,
		});	
	}

	disallowed(act) {
		return act.type.toLowerCase().includes("virtual") || 
			act.trainer ||
			!act.map ||
			!act.upload_id;
	}

	async pushActivity(act) {
		const activity = mongoose.model('Activity', Activity);
		const user = mongoose.model('User', User);
		const service = 'strava';

		const stravaUser = user.findOne({'strava.id': act.owner_id});
		if (act.aspect_type === 'delete') {
			act.deleteOne({id: act.object_id, service}, function(){
				console.log(`deleting: ${act.id}`);
			});
		} else {
			const params = {
				id: act.object_id.toString(),
				last: Date.now(),
				service,
				user: stravaUser._id
			}	
			const doc = await activity.findOne({id: act.object_id.toString(), user, service}).exec();
			if (doc) {
				await doc.set(params);
				console.log('updated');
			} else {
				await activity.create(params);
				console.log('created');
			}
		}
	}

	async loadAll(user){
		let page = 1;
		const perPage = 200;
		const activities = [];
		const service = 'strava';
		let keepLooping = true;
		const subs = await stravaApi.pushSubscriptions.list();
		if(!subs) {
			const sub = strava.pushSubscriptions.create({
				callback_url: `${process.env.SITE_URL}/api/locations/strava/push`
			});

			console.log(sub);
		}
		try {
			while( keepLooping ) {
				const results = await stravaApi.athlete.listActivities({
					page,
					// eslint-disable-next-line @typescript-eslint/camelcase
					per_page: perPage
				});
				console.log(page);
				activities.push(...results);

				if ( results.length === perPage ){
					keepLooping = true;
					page++;
				} else {
					keepLooping = false;
				}
			}
			console.log(`found ${activities.length} activities at Strava`);

			/* TODO: do one big query to filter out ones to not sync */
			
			for (let i=0; i < activities.length; i++){
				const act = activities[i];
				const activity = mongoose.model('Activity', Activity);
				if (this.disallowed(act)) {
					activity.deleteOne({id: act.id.toString(), user, service}, function(){
						console.log(`deleting: ${act.id}`);
					});
				} else {
					const doc = await activity.findOne({id: act.id.toString(), user, service}).exec();

					if(doc && doc.location && doc.location.coordinates && doc.location.coordinates.length && doc.meta){
						console.log('already synced');
					} else {
						console.log(`found a fresh one: ${act.id}`);
						let coords;
						let activityObj;
						try{
							console.log("loading from strava...");
							coords = await stravaApi.streams.activity({
								types: "latlng",
								id: act.id
							}).filter( ret => ret.type == 'latlng' );

							activityObj = await stravaApi.activities.get({
								id: act.id
							})
						} catch (e) {
							console.log(`Does not exist in Strava: ${act.id}`);
						}

						if (coords && coords.length) { 
							let location = turf.flip(turf.multiPoint(coords[0].data)).geometry;

							const options = { upsert: true, new: true, setDefaultsOnInsert: true };

							const params = {
								id: act.id.toString(),
								last: Date.now(),
								service,
								user,
								location,
								meta: activityObj
							}	

							if (doc) {
								await doc.set(params);
								doc.markModified('meta');
								console.log('updated');
							} else {
								await activity.create(params);
								console.log('created');
							}
						} else {
							console.log('invalid, no coordinates');
						}
					}
				}
			}

			return {success: true}
		} catch (e) {
			return {success: false}
		}
	}
}

module.exports = {
	Strava
};