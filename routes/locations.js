/* eslint-disable @typescript-eslint/no-var-requires */
const { PerformanceObserver, performance } = require('perf_hooks');
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Handle the datastuffs
const geobuf = require('geobuf');
const Pbf = require('pbf');

const turf = require('@turf/turf');

const { Strava } = require('../includes/syncs/Strava');
let strava;

const Activity = require('../includes/models/Activity');
const activity = mongoose.model('Activity', Activity);
const auth = require('./auth').auth;
router.use(auth);

const obs = new PerformanceObserver((items) => {
  console.log(`${items.getEntries()[0].name}: ${items.getEntries()[0].duration}`);
});
obs.observe({ entryTypes: ['measure'] });

router.use(function(req, res, next) {
	strava = new Strava();
	strava.setId(req.user.strava.access);
	next();
})
router.get('/profile/:service', async function(req, res, next) {
	switch (req.params.service) {
		case "strava" : 
			res.send(await strava.athlete.get({}));
			break;
		default :
			res.json(false);
	}
})
router.get('/sync/:service', async function(req, res, next){
	switch (req.params.service) {
		case "strava" : 
			res.send(await strava.loadAll(req.user.id));
			break;
		default :
			res.json(false);
	}
})

router.get('/:service?', async function(req, res, next){
	const params = {
		'user' : req.user.id
	}
	const returns = ['id', 'location'];
	if (req.params.service) {
		params.service = req.params.service
	} else {
		returns.push('service');
	}
	const query = activity.find(params)
		.cursor()
		.pipe(JSONStream.stringify())
		.pipe(res.type('json'));

})

router.get('/:service/points/:bbox', async function(req, res, next){
	const bbox = req.params.bbox;
	const bboxArr = bbox.split(",");
	const distance = turf.distance([bboxArr[0], bboxArr[1]],[bboxArr[2], bboxArr[1]]);
	let hrstart = process.hrtime();
	console.log(`getting points`);
	const points = await allPointsInBBox(bbox, req.user.id, req.params.service);
	
	console.log(`took: ${process.hrtime(hrstart)}`);
	hrstart = process.hrtime();
	console.log(`converting to FC`);
	const mp = turf.multiPoint(points);
	console.log(`took: ${process.hrtime(hrstart)}`);

	hrstart = process.hrtime();
	const simplified = turf.explode(
		turf.cleanCoords(
			// mp.geometry
			turf.truncate(mp.geometry, {
				precision: 4,
				mutate: true,
			})
		)
	);
	const buf = geobuf.encode(simplified, new Pbf());
	console.log(`remainder took: ${process.hrtime(hrstart)}`);
	res.end(buf);
});

async function allPointsInBBox(bBox, user, service){
	const bBoxArray = bBox.split(',').map(loc => +loc);
	const feature = turf.bboxPolygon(bBoxArray);

	const params = {
		user,
		service
	}

	const results = await activity.aggregate([
		{
			$match: params
		},
		{
			$match: {
				$or : [
					{ 'location' : {
							$geoIntersects: {
								$geometry: feature.geometry
							}
						},
					},
					{ 'location' : {
							$geoWithin: {
								$geometry: feature.geometry
							}
						}
					}
				]
			}
		},
		// {
		// 	$project: {
		// 		"location.coordinates": {
		// 			"$reduce": {
		// 				"input": {
		// 					$map : {
		// 						input: "$location.coordinates",
		// 						as: "coordinate",
		// 						in: {
		// 							$map: {
		// 								input: "$$coordinate",
		// 								as: "coord",
		// 								in: {
		// 									$round: ["$$coord", 4]
		// 								}
		// 							}
		// 						}
		// 					}
		// 				},
		// 				"initialValue": [],
		// 				"in": { 
		// 					"$setUnion": ["$$value", ["$$this"]]
		// 				}
		// 			}
		// 		}
		// 	}
		// }
	])
	.cursor({
		batchSize: 50
	})
	.exec()

	const resArray = [];

	return new Promise((res, rej) => {
		results
			.on('data', (doc) => {
				resArray.push(...doc.location.coordinates);
			})
			.on('end', () => {
				res(resArray);
			});
	})

}
module.exports = router;
