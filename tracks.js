#!/usr/bin/env node

const fs = require('fs')
const URL = require('url')
const axios = require('axios')
const sha256 = require('sha.js')('sha256')
const togeojson = require('@mapbox/togeojson')
const topojson = require('topojson-server')
const rides = JSON.parse(fs.readFileSync('perms.json'))
const DOMParser = require('xmldom').DOMParser

function fetchRideWithGPS (url) {
  const gpxURL = url + '.gpx?sub_format=track'
  return axios.get(gpxURL)
    .then(response => {
      if (response.status === 404) {
        return Promise.resolve(null)
      }
      return response.data
    })
}

function fetchBikeRouteToaster (url) {
  const id = /(?:Course.aspx\?course=|BRTWebUI\/Course\/)(\d+)/.exec(url)[1]

  return axios.get('http://bikeroutetoaster.com/api/BRT.WebUI/Course/GetCourse/' + id)
    .then(response => {
      if (response.status === 404) {
        console.log('Course not found')
        return Promise.resolve(null)
      }
      return axios.post('http://bikeroutetoaster.com/BRTWebUI/Export/GPX', {data: response.data.CourseFile}).then(r => r.data)
    })
}

function fetchGeoJSON (gpx) {
  if (gpx === null) { return null }
  const dom = new DOMParser()

  const geojson = togeojson.gpx(dom.parseFromString(gpx, 'application/xml'))
  return geojson
}

function fetchTopoJSON (geojson) {
  if (geojson === null) { return null }
  return topojson.topology({data: geojson})
}

function fetchGPX (trackURL) {
  if (typeof trackURL !== 'string') return Promise.resolve(null)
  const url = URL.parse(trackURL)
  switch (url.host) {
    case 'ridewithgps.com':
      const start = url.path.substring(0, 7)
      if (start === '/routes') {
        return fetchRideWithGPS(trackURL)
      }
      return Promise.resolve(null)
    case 'bikeroutetoaster.com':
    case 'www.bikeroutetoaster.com':
      return fetchBikeRouteToaster(trackURL)

    case 'audax.org.au':
    case 'www.audax.org.au':
    case 'www.google.com':
      return Promise.resolve(null)
    default:
      console.log('Unknown host ' + url.host)
      return Promise.resolve(null)
  }
}

function downloadTrack (trackURL) {
  if (trackURL == null) { return null }
  const filename = 'data/' + sha256.update(trackURL).digest('hex') + '.' + 'topojson'
  if (fs.existsSync(filename)) {
    return new Promise((resolve, reject) => {
      fs.readFile(filename, (err, data) => {
        if (err) {
          console.log(err)
          return reject(err)
        }
        return resolve(filename)
      })
    })
  }
  return fetchGPX(trackURL)
    .then(fetchGeoJSON)
    .then(fetchTopoJSON)
    .then(topoJSON => {
      return new Promise((resolve, reject) => {
        fs.writeFile(filename, JSON.stringify(topoJSON), (err, data) => {
          if (err) {
            console.log(err)
            return reject(err)
          }
          return resolve(filename)
        })
      })
    })
}

function downloadTracks (ride) {
  return Promise.all(
    ride.attachments.map(a => downloadTrack(a.txtURL)).filter(data => data !== undefined)
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
        console.log('No tracks links found for ' + ride.txtRideName)
        console.log(ride.attachments)
        console.log('------------------')
      }
    })
}

Promise.all(rides.map(downloadTracks))
  .then(perms => perms.filter(perm => perm != null))
  .then(perms => {
    fs.writeFileSync('data/perms.json', JSON.stringify(perms))
  })
