// singlemap.js directory [<data directory>]
// Checks all maps in the directory and subdirectories, and makes sure they parse.
// Also generates images for all of them. Running this script on a 3000+ map
// directory can take over an hour, and generate several gigabytes of pngs.
import fs from 'fs'
import path from 'path'
import BufferList from 'bl'
import async from 'async'
import ScmExtractor from 'scm-extractor'
import {PNG} from 'pngjs'
import Chk, {Tilesets, SpriteGroup} from '../'
import 'process'
import * as readline from 'readline'
import streamToPromise from 'stream-to-promise'

let goodMaps = 0
let scmExErrs = 0
let chkErrs = 0

const mapQueue = async.queue((filename, finish) => {
  checkmap(filename).then(() => finish(), (err) => {
    console.log(err)
    finish(err)
  })
}, 5)

const dataDir = process.argv[3] || '.'
const tilesets = new Tilesets
tilesets.init(dataDir)

const sprites = new SpriteGroup()
function loadSprites() {
  const unitList = fs.createReadStream('units.txt')
  const units = readline.createInterface({ input: unitList })
  let unitId = 0
  units.on('line', line => {
    sprites.addUnit(unitId, dataDir + '/unit/' + line)
    unitId += 1
  })
  const spriteList = fs.createReadStream('sprites.txt')
  const bwSprites = readline.createInterface({ input: spriteList })
  let spriteId = 0
  bwSprites.on('line', line => {
    sprites.addSprite(spriteId, dataDir + '/unit/' + line)
    spriteId += 1
  })
  return Promise.all([streamToPromise(unitList), streamToPromise(spriteList)])
}

loadSprites()
  .then(() => {}, err => {
    console.log('Could not load init files: ' + err)
    tilesets = undefined
  })
  .then(() => checkmaps(process.argv[2]), err => {
    checkmaps(process.argv[2])
    console.log(err)
  })
  .then(() => {
    const finish = () => {
      console.log('Good maps: ' + goodMaps)
      console.log('scm-extractor errors: ' + scmExErrs)
      console.log('bw-chk errors: ' + chkErrs)
    }
    mapQueue.drain = finish
    if (quque.idle()) {
      finish()
    }
  })

function checkmap(filename) {
  async function writeImage(image, image_filename) {
    await new Promise((res, rej) => {
      const file = fs.createWriteStream(image_filename)
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
      if (tilesets !== undefined) {
        for (const mul of [8]) {
          const minimap = await map.image(tilesets, sprites, map.size[0] * mul, map.size[1] * mul)
          if (minimap === undefined) {
            throw Error('Minimap fail')
          }
          const image = new PNG({
            width: map.size[0] * mul,
            height: map.size[1] * mul,
            inputHasAlpha: false,
          })
          image.data = minimap
          const image_filename = `images/${path.basename(filename)}_x${mul}.png`
          await writeImage(image, image_filename)
        }
      }
    }
    catch (err) {
      console.log('bw-chk: ' + err + ' (' + filename + ')')
      console.log(err.stack)
      chkErrs += 1
      return
    }
    goodMaps += 1
  }

  function readmap(filename, res, rej) {
    const mpq = fs.createReadStream(filename)
    const chk = mpq.pipe(ScmExtractor())
      .pipe(BufferList((err, buf) => {
        if (err) {
          console.log('scm-extractor: ' + err + ' (' + filename + ')')
          scmExErrs += 1
          res()
          return
        }
        parseChk(buf).then(res, rej)
      }))
    mpq.on('error', (err) => {
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

function checkentry(filename) {
  return new Promise((res, rej) => {
    fs.stat(filename, async function(err, stats) {
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
    fs.readdir(path, async function(err, files) {
      if (err) {
        reject(err)
        return
      }
      await Promise.all(files.map(file => checkentry(path + '/' + file)))
      resolve()
    })
  })
}
