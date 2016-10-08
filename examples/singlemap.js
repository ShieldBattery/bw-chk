// singlemap.js <map.scx> [<data directory>]
// Reads various information from a .scx file.

/* eslint no-console: "off" */

import Chk, {SpriteGroup, Tilesets} from '../'

import BufferList from 'bl'
import fs from 'fs'
import {PNG} from 'pngjs'
import readline from 'readline'
import scmExtractor from 'scm-extractor'
import streamToPromise from 'stream-to-promise'

const out = fs.createReadStream(process.argv[2])
  .pipe(scmExtractor())
  .pipe(fs.createWriteStream('extracted.chk'))

const dataDir = process.argv[3]

out.on('finish', () => {
  const stream = fs.createReadStream('extracted.chk')
    .pipe(new BufferList((err, buf) => {
      if (err) {
        console.log(err)
        return
      }
      printMapInfo(buf).then(() => {}, err => {
        console.log(err)
        console.log(err.stack)
      });
  }))
  stream.on('error', err => {
    console.log(err)
  })
})

async function printMapInfo(buf) {
  const map = new Chk(buf)
  let tilesets = new Tilesets()
  const sprites = new SpriteGroup()

  if (dataDir !== undefined) {
    tilesets.init(dataDir)

    // Load all default units/sprites. If the data directory does not contain a sprite that is
    // needed for rendering, `chk.image` will throw when it tries to read it.
    const unitList = fs.createReadStream('units.txt')
    const units = readline.createInterface({ input: unitList })
    let unitId = 0
    units.on('line', line => {
      sprites.addUnit(unitId, `${dataDir}/unit/${line}`)
      unitId += 1
    })
    const spriteList = fs.createReadStream('sprites.txt')
    const bwSprites = readline.createInterface({ input: spriteList })
    let spriteId = 0
    bwSprites.on('line', line => {
      sprites.addSprite(spriteId, `${dataDir}/unit/${line}`)
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
    const minimapWidth = map.size[0] * 8
    const minimapHeight = map.size[1] * 8
    try {
      const minimap = await map.image(tilesets, sprites, minimapWidth, minimapHeight)
      if (minimap !== undefined) {
        const image = new PNG({
          width: minimapWidth,
          height: minimapHeight,
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

