// singlemap.js directory [<data directory>]
// Checks all maps in the directory and subdirectories, and makes sure they parse.
// Also generates images for all of them. Running this script on a 3000+ map
// directory can take over an hour, and generate several gigabytes of pngs.

/* eslint no-console: "off" */

import async from 'async'
import Chk from '../index.js'
import fs from 'fs'
import glob from 'glob'
import path from 'path'
import {PNG} from 'pngjs'
import scmExtractor from 'scm-extractor'

let count = 0
let goodMaps = 0
let scmExErrs = 0
let chkErrs = 0

const mapQueue = async.queue((filename, finish) => {
  checkmap(filename).catch(err => {
    console.log(err)
    return err
  })
  .then(err => {
    count += 1
    if (count % 500 === 0) {
      console.log(`${count} maps done`)
    }
    finish(err)
  })
}, 5)

const fileAccess = process.argv[3] ? Chk.fsFileAccess(process.argv[3]) : null

function checkmaps(path) {
  // The glob library requires forward slashes
  const pattern = path.replace(/\\/g, '/') + '/**/*.sc[mx]'
  return new Promise((resolve, reject) => {
    glob(pattern, { nodir: true }, async (err, files) => {
      if (err) {
        reject(err)
        return
      }

      for (const file of files) {
        mapQueue.push(file)
      }
      resolve()
    })
  })
}

checkmaps(process.argv[2])
  .then(() => {
    const finish = () => {
      console.log('Good maps: ' + goodMaps)
      console.log('scm-extractor errors: ' + scmExErrs)
      console.log('bw-chk errors: ' + chkErrs)
    }
    mapQueue.drain(finish)
    if (mapQueue.idle()) {
      finish()
    }
  })
  .catch(err => console.log(err))

function checkmap(filename) {
  async function writeImage(image, imageFilename) {
    await new Promise(res => {
      const file = fs.createWriteStream(imageFilename)
      file.on('error', err => {
        // Too many file descriptors
        if (err.code === 'EMFILE') {
          setTimeout(() => writeImage(image, filename), 1000)
        } else {
          console.log('Image write fail: ' + err)
          console.log('Code: ' + err.code + '//' + err.errno)
          throw err
        }
      })
      file.on('finish', () => {
        res()
      })
      image.pack().pipe(file)
    })
  }

  async function renderImage(map) {
    for (const mul of [8]) {
      const minimap = await map.image(fileAccess, map.size[0] * mul, map.size[1] * mul)
      const image = new PNG({
        width: map.size[0] * mul,
        height: map.size[1] * mul,
        inputHasAlpha: false,
      })
      image.data = minimap
      const imageFilename = `images/${path.basename(filename)}_x${mul}.png`
      await writeImage(image, imageFilename)
    }
  }

  function readmap(filename, res) {
    const file = fs.createReadStream(filename)
    const mpq = file.pipe(scmExtractor())
    const chkError = err => {
      console.log('bw-chk: ' + err + ' (' + filename + ')')
      console.log(err.stack)
      chkErrs += 1
    }
    mpq.pipe(Chk.createStream((err, chk) => {
      if (err) {
        chkError(err)
      } else if (fileAccess !== null) {
        renderImage(chk).then(() => {
          goodMaps += 1
        })
        .catch(chkError)
      } else {
        goodMaps += 1
      }
      res()
    }))
    mpq.on('error', err => {
      console.log('scm-extractor: ' + err + ' (' + filename + ')')
      scmExErrs += 1
      res()
    })
    file.on('error', err => {
      // Too many file descriptors
      if (err.code === 'EMFILE') {
        setTimeout(() => {
          readmap(filename, res)
        }, 1000)
      } else {
        console.log('huoh: ' + err)
        console.log('Code: ' + err.code + '//' + err.errno)
        throw err
      }
    })
  }
  return new Promise(res => readmap(filename, res))
}
