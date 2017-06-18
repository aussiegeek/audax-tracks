#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const URL = require('url')
const axios = require('axios')
const sha256 = require('sha.js')('sha256')
const togeojson = require('@mapbox/togeojson')
const topojson = require('topojson-server')
const rides = JSON.parse(fs.readFileSync('perms.json'))
const DOMParser = require('xmldom').DOMParser

function filterPerm (urlString) {
  if (typeof urlString !== 'string') return false

  const url = URL.parse(urlString)
  switch (url.host) {
    case 'ridewithgps.com':
      const start = url.path.substring(0, 7)
      return start === '/routes'
    case 'audax.org.au':
    case 'www.audax.org.au':
    case 'www.google.com':
      return false
    default:
      return false
  }
}

function fetchGPX (url) {
  const gpxURL = url + '.gpx?sub_format=track'
  const filename = 'data/' + sha256.update(url).digest('hex') + '.' + 'gpx'
  if (fs.existsSync(filename)) {
    return new Promise((resolve, reject) => {
      fs.readFile(filename, (err, data) => {
        if (err) {
          console.log(err)
          reject(err)
        }
        resolve(filename)
      })
    })
  } else {
    return axios.get(gpxURL)
      .then(response => {
        if (response.status === 404) {
          return null
        }
        fs.writeFileSync(filename, response.data)
        return filename
      })
  }
}

function fetchGeoJSON (gpxpath) {
  const basename = path.basename(gpxpath, '.gpx')
  const geojsonFilename = 'data/' + basename + '.geojson'
  if (!fs.existsSync(geojsonFilename)) {
    var gpx = new DOMParser().parseFromString(fs.readFileSync(gpxpath, 'utf8'))
    const geojson = togeojson.gpx(gpx)

    fs.writeFileSync(geojsonFilename, JSON.stringify(geojson))
  }

  return geojsonFilename
}

function fetchTopoJSON (geojsonpath) {
  const basename = path.basename(geojsonpath, '.geojson')
  const topojsonFilename = 'data/' + basename + '.topojson'
  if (!fs.existsSync(topojsonFilename)) {
    const geojson = JSON.parse(fs.readFileSync(geojsonpath, 'utf8'))
    const topojsonObject = topojson.topology({data: geojson})
    fs.writeFileSync(topojsonFilename, JSON.stringify(topojsonObject))
  }
  return topojsonFilename
}

function downloadPerm (url) {
  return fetchGPX(url)
    .then(fetchGeoJSON)
    .then(fetchTopoJSON)
}

function downloadTrack (ride) {
  return Promise.all(
    ride.attachments.map(a => a.txtURL)
      .filter(filterPerm)
      .map(downloadPerm)
  )
    .then(topojsonPaths => {
      if (topojsonPaths.length > 0) {
        return {
          name: ride.txtRideName,
          description: ride.txtRideDescription,
          distance: ride.intRideDistanceNominal + 'km',
          links: [ride.directlink],
          topoJson: topojsonPaths
        }
      } else {
        console.log('No RideWithGPS links found for ' + ride.txtRideName)
      }
    })
}

Promise.all(rides.map(downloadTrack))
  .then(perms => perms.filter(perm => perm != null))
  .then(perms => {
    fs.writeFileSync('data/perms.json', JSON.stringify(perms))
  })
