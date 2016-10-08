// singlemap.js directory [<data directory>]
// Checks all maps in the directory and subdirectories, and makes sure they parse.
// Also generates images for all of them. Running this script on a 3000+ map
// directory can take over an hour, and generate several gigabytes of pngs.

/* eslint no-console: "off" */

import async from 'async'
import BufferList from 'bl'
import Chk from '../'
import fs from 'fs'
import path from 'path'
import {PNG} from 'pngjs'
import scmExtractor from 'scm-extractor'

let goodMaps = 0
let scmExErrs = 0
let chkErrs = 0

const mapQueue = async.queue((filename, finish) => {
  checkmap(filename).then(() => finish(), err => {
    console.log(err)
    finish(err)
  })
}, 5)

const fileAccess = process.argv[3] ? Chk.fsFileAccess(process.argv[3]) : null

function checkentry(filename) {
  return new Promise((res, rej) => {
    fs.stat(filename, async (err, stats) => {
      if (err) {
        console.log(err)
        rej()
        return
      }
      if (stats.isFile()) {
        const extension = filename.slice(-4)
        if (extension === '.scm' || extension === '.scx') {
          mapQueue.push(filename)
        }
      } else if (stats.isDirectory()) {
        await checkmaps(filename)
      }
      res()
    })
  })
}

function checkmaps(path) {
  return new Promise((resolve, reject) => {
    fs.readdir(path, async (err, files) => {
      if (err) {
        reject(err)
        return
      }
      await Promise.all(files.map(file => checkentry(`${path}/${file}`)))
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
    mapQueue.drain = finish
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

  async function parseChk(buf) {
    try {
      const map = new Chk(buf)
      if (fileAccess !== null) {
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
    } catch (err) {
      console.log('bw-chk: ' + err + ' (' + filename + ')')
      console.log(err.stack)
      chkErrs += 1
      return
    }
    goodMaps += 1
  }

  function readmap(filename, res, rej) {
    const mpq = fs.createReadStream(filename)
    mpq.pipe(scmExtractor())
      .pipe(new BufferList((err, buf) => {
        if (err) {
          console.log('scm-extractor: ' + err + ' (' + filename + ')')
          scmExErrs += 1
          res()
          return
        }
        parseChk(buf).then(res, rej)
      }))
    mpq.on('error', err => {
      // Too many file descriptors
      if (err.code === 'EMFILE') {
        setTimeout(() => {
          readmap(filename, res, rej)
        }, 1000)
      } else {
        console.log('huoh: ' + err)
        console.log('Code: ' + err.code + '//' + err.errno)
        throw err
      }
    })
  }
  return new Promise((res, rej) => readmap(filename, res, rej))
}
