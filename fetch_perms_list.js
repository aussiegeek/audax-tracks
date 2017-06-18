#!/usr/bin/env node

const axios = require('axios')
const fs = require('fs')

const regions = [
  211501,
  311501,
  411501,
  511501,
  611501,
  711501,
  811501,
  911501
]

function fetchPerm (id) {
  return axios.get('https://audax.org.au/portal/index.php/component/chronoforms5?chronoform=AudaxPermanents&event=getPermanent&tvout=ajax&PermanentID=' + id).then(response => response.data)
}

function fetchRegionPermIds (regionId) {
  return axios.get('https://audax.org.au/portal/index.php/rides/online-permanents?chronoform=AudaxPermanents&event=getRideList&tvout=ajax&regionCode=' + regionId).then(response => {
    return Object.keys(response.data)
      .map(id => parseInt(id, 10))
      .filter(id => id !== 0)
  })
}

function fetchAllPermIds () {
  return Promise.all(regions.map(regionId => fetchRegionPermIds(regionId)))
    .then(regions => regions.reduce((acc, val) => acc.concat(val)))
}

function savePerms (perms) {
  fs.writeFileSync('perms.json', JSON.stringify(perms, null, 2))
}
fetchAllPermIds().then(permIds => {
  return Promise.all(permIds.map(id => fetchPerm(id)))
}).then(savePerms)
