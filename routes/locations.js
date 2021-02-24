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
});

router.get('/profile/:service', async function(req, res, next) {
	switch (req.params.service) {
		case "strava" : 
			res.send(await strava.athlete.get({}));
			break;
		default :
			res.json(false);
	}
});

router.get('/sync/:service', async function(req, res, next){
	switch (req.params.service) {
		case "strava" : 
			res.send(await strava.loadAll(req.user.id));
			break;
		default :
			res.json(false);
	}
});

router.get('/grid/:bbox', async function(req, res, next) {
	const bBoxArray = req.params.bbox.split(',').map(loc => +loc);
	const mask = turf.bboxPolygon(bBoxArray);
	const size = 10;
	const southLimit = -55;
	const northLimit = 78;
	const grid1 = turf.hexGrid([-180, southLimit, 0, northLimit], size, {
		mask
	}).features;
	const grid2 = turf.hexGrid([0, southLimit, 180, northLimit], size, {
		mask
	}).features
	const grid = turf.featureCollection([...grid1,...grid2]);
	const points = simplifyCoords(await allPointsInBBox(req.params.bbox, req.user.id));
	const foundFeatures = [];
	for (const point of points.features) {
		let found = false;
		let index = 0;
		try {
			while(!found && grid.features.length && index < grid.features.length - 1) {
				found = turf.booleanPointInPolygon(turf.point(point.geometry.coordinates), grid.features[index]);
				index++;
			}
			if (found) {
				console.log(found);
				foundFeatures.push(Object.assign({}, grid.features[index]));
				grid.features.splice(index, 1);
			}

		} catch(e) {
			console.log(grid.features.length);
		}
	}

	sendGeoBuf(res, turf.featureCollection(foundFeatures));
});


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

});

router.get('/:service/points/:bbox', async function(req, res, next){
	const bbox = req.params.bbox;
	let hrstart = process.hrtime();
	console.log(`getting points`);
	const points = await allPointsInBBox(bbox, req.user.id, req.params.service);
	
	console.log(`took: ${process.hrtime(hrstart)}`);
	hrstart = process.hrtime();
	console.log(`converting to FC`);

	sendGeoBuf(res, simplifyCoords(points));
});

function simplifyCoords(points) {
	const mp = turf.multiPoint(points);

	return turf.explode(
		turf.cleanCoords(
			turf.truncate(mp.geometry, {
				precision: 4,
				mutate: true,
			})
		)
	);
}

function sendGeoBuf(res, geojson) {
	const buf = geobuf.encode(geojson, new Pbf());
	res.end(buf);
}

async function allPointsInBBox(bBox, user, srv){
	const service = srv || 'strava';
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
		}
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
	});
}
module.exports = router;
