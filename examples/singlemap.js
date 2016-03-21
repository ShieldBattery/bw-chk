// singlemap.js <map.scx> [<data directory>]
// Reads various information from a .scx file.
import fs from 'fs'
import BufferList from 'bl'
import {PNG} from 'pngjs'
import ScmExtractor from 'scm-extractor'
import Chk, {Tilesets, SpriteGroup} from '../'
import readline from 'readline'
import streamToPromise from 'stream-to-promise'

const out = fs.createReadStream(process.argv[2])
  .pipe(ScmExtractor())
  .pipe(fs.createWriteStream('extracted.chk'))

const dataDir = process.argv[3]

out.on('finish', () => {
  const stream = fs.createReadStream('extracted.chk')
    .pipe(BufferList(function(err, buf) {
      if (err) {
        console.log(err)
        return
      }
      printMapInfo(buf).then(() => {}, err => { console.log(err); console.log(err.stack) });
  }))
  stream.on('error', (err) => {
    console.log(err)
  })
})

async function printMapInfo(buf) {
  const map = new Chk(buf)
  let tilesets = new Tilesets
  const sprites = new SpriteGroup

  if (dataDir !== undefined) {
    tilesets.init(dataDir)

    // Load all default units/sprites. If the data directory does not contain a sprite that is
    // needed for rendering, `chk.image` will throw when it tries to read it.
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
    await Promise.all([streamToPromise(unitList), streamToPromise(spriteList)])
  }

  console.log('Title: ' + map.title)
  console.log('Description: ' + map.description)
  console.log('Tileset: ' + map.tilesetName)
  console.log('Size: ' + map.size[0] + 'x' + map.size[1])
  console.log('Forces:')
  for (const force of map.forces) {
    console.log('  ' + force.name + ': ' + force.players.length + ' players')
  }
  console.log('Melee players: ' + map.maxPlayers(false))

  // Create an image with 25% resolution
  if (dataDir !== undefined) {
    const minimap_width = map.size[0] * 8
    const minimap_height = map.size[1] * 8
    try {
      const minimap = await map.image(tilesets, sprites, minimap_width, minimap_height)
      if (minimap !== undefined) {
        const image = new PNG({
          width: minimap_width,
          height: minimap_height,
          inputHasAlpha: false,
        })
        image.data = minimap
        image.pack().pipe(fs.createWriteStream('minimap.png'))
      } else {
        console.log('Could not create minimap image')
      }
    } catch (err) {
      console.log('Could not create minimap image', err.stack)
    }
  }
}

