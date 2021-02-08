/* eslint-disable @typescript-eslint/no-var-requires */
const stravaApi = require('strava-v3');
const mongoose = require('mongoose');
const flip = require('@turf/flip');

const Activity = require('../models/Activity');

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

	async loadAll(user){
		let page = 1;
		const perPage = 200;
		const activities = [];
		const service = 'strava';
		let keepLooping = true;

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
			await new Promise( (resolve, reject) => {
				const activity = mongoose.model('Activity', Activity);
				if (this.disallowed(act)) {
					activity.deleteOne({id: act.id.toString(), user, service}, function(){
						console.log(act.id);
						resolve();
					});
				} else {
					activity.findOne({id: act.id.toString(), user, service}, async function(err, doc){
						if(doc && doc.location && doc.location.coordinates && doc.location.coordinates.length){
							console.log('already synced')
						} else {
							console.log(`found a fresh one: ${act.id}`);
							let coords;
							try{
								console.log("loading from strava...");
								coords = await stravaApi.streams.activity({
									types: "latlng",
									id: act.id
								}).filter( ret => ret.type == 'latlng' );
							} catch (e) {
								console.log(`Does not exist in Strava: ${act.id}`);
							}

							if (coords && coords.length) { 
								await new Promise( (res, rej) =>{
									let location = {
										type: "MultiPoint",
										coordinates: coords[0].data
									}
									const options = { upsert: true, new: true, setDefaultsOnInsert: true };

									location = flip(location);

									const params = {
										id: act.id.toString(),
										last: Date.now(),
										service,
										user,
										location
									}	
									activity.findOneAndUpdate({'id' : act.id, service}, params, options, function(err){
										if (err) { 
											console.log(err);
											rej(); 
										}
										console.log('updated');
										res();
									});
									
								});
							} else {
								console.log('invalid, no coordinates');
							}
						}
						
						resolve();						
					});
				}
			});
		}

		return {success: true}		
	}
}

module.exports = {
	Strava
};