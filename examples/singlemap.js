// singlemap.js <map.scx> [<data directory>]
// Reads various information from a .scx file.

/* eslint no-console: "off" */

import Chk from '../index.js'
import fs from 'fs'
import {PNG} from 'pngjs'
import scmExtractor from 'scm-extractor'

const out = fs.createReadStream(process.argv[2])
  .pipe(scmExtractor())
  .pipe(fs.createWriteStream('extracted.chk'))

const dataDir = process.argv[3]

out.on('finish', () => {
  const stream = fs.createReadStream('extracted.chk')
    .pipe(Chk.createStream((err, chk) => {
      if (err) {
        console.log(err)
        return
      }
      printMapInfo(chk).catch(err => {
        console.log(err)
        console.log(err.stack)
      })
  }))
  stream.on('error', err => {
    console.log(err)
  })
})

async function printMapInfo(map) {
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
      try {
        const minimap = await map.image(Chk.fsFileAccess(dataDir), minimapWidth, minimapHeight)
        const image = new PNG({
          width: minimapWidth,
          height: minimapHeight,
          inputHasAlpha: false,
        })
        image.data = minimap
        image.pack().pipe(fs.createWriteStream('minimap.png'))
      } catch (err) {
        console.log('Could not create minimap image: ' + err)
      }
    } catch (err) {
      console.log('Could not create minimap image', err.stack)
    }
  }
}

