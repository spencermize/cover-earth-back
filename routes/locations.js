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
const auth = require('./auth').auth

const unless = function(path, middleware) {
    return function(req, res, next) {
        if (path === req.path) {
            return next();
        } else {
            return middleware(req, res, next);
        }
    };
};

router.use(unless('/strava/push', auth));

router.use(unless('/strava/push', function(req, res, next) {
	strava = new Strava();
	strava.setId(req.user.strava.access);
	next();
}));

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

router.get('/strava/push', function(req, res, next){
	console.log(req);
	res.json({'hub.challenge' : req.query['hub.challenge']});
});

router.post('/strava/push', async function(req, res, next){
	const strava = new Strava();
	if (req.body.object_type === 'activity') {
		await strava.pushActivity(req.body);
		res.json({});
	} else {
		res.status(400).send();
	}
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

router.get('/:service/activities/:bbox?', async function(req, res, next){
	const bbox = req.params.bbox || 'all';
	
	const activities = await allActivitiesInBBox(bbox, req.user.id, req.params.service);
	const ret = activities.map(activity => {
		return Object.fromEntries(Object.entries(activity).filter(([_, v]) => v != null));
	});

	res.json(ret);

});

router.get('/:service/points/:bbox', async function(req, res, next){
	const bbox = req.params.bbox;
	const points = await allActivitiesInBBox(bbox, req.user.id, req.params.service, true);

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

async function allActivitiesInBBox(bBox, user, srv, filter){
	const resArray = [];
	const service = srv || 'strava';
	const filters = filter || 'coords'; // don't include these
	let feature = null;
	
	if (bBox !== 'all') {
		const bBoxArray = bBox.split(',').map(loc => +loc);
		feature = turf.bboxPolygon(bBoxArray);
	}

	const params = {
		user,
		service
	}

	const bboxQuery = bBox === 'all' ? {
		$match: {

		}
	} : {
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
	};
	const results = await activity.aggregate([
		{
			$match: params
		},
		bboxQuery,
		{
			$project: {
				'location' : filters || !filters.includes('coords')
			}
		}
	])
	.cursor({
		batchSize: 50
	})
	.exec();

	return new Promise((res, rej) => {
		results
			.on('data', (doc) => {
				if (filters || !filters.includes('coords')) {
					resArray.push(...doc.location.coordinates);
				} else {
					resArray.push(doc);
				}
			})
			.on('end', () => {
				res(resArray);
			});
	});
}
module.exports = router;
