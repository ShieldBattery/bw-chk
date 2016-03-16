import fs from 'fs'
import path from 'path'
import BufferList from 'bl'
import async from 'async'
import ScmExtractor from 'scm-extractor'
import {PNG} from 'pngjs'
import Chk, {Tilesets, SpriteGroup} from './index.js'
import 'process'

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
let tilesets = new Tilesets
async function loadTilesets() {
  const tilesetNames = ['badlands', 'platform', 'install',
    'ashworld', 'jungle', 'desert', 'ice', 'twilight']
  for (const entry of tilesetNames.entries()) {
    const path = dataDir + '/tileset/' + entry[1]
    await tilesets.addFile(entry[0], path + '.cv5', path + '.vx4', path + '.vr4', path + '.wpe')
  }
}

const units = [[214, 'thingy/startloc.grp'], [176, 'neutral/min01.grp'],
  [177, 'neutral/min01.grp'], [178, 'neutral/min03.grp'], [188, 'neutral/geyser.grp']]
const sprites = new SpriteGroup
for (const entry of units) {
  const path = dataDir + '/unit/' + entry[1]
  sprites.addUnitLazy(entry[0], path)
}

loadTilesets()
  .then(() => {}, err => {
    console.log('Could not load tilesets: ' + err)
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
          const minimap = await map.minimapImage(tilesets, sprites, map.size[0] * mul, map.size[1] * mul)
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
