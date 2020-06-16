const { promisify } = require(`bluebird`)
const _ = require(`lodash`)
const tmpDir = require(`os`).tmpdir()
const path = require(`path`)
const sharp = require(`./safe-sharp`)
const filenamify = require(`filenamify`)
const duotone = require(`./duotone`)
const { getPluginOptions, healOptions } = require(`./plugin-options`)
const { reportError } = require(`./report-error`)
const { createContentDigest } = require(`gatsby-core-utils`)

exports.notMemoizedPrepareTraceSVGInputFile = async ({
  file,
  options,
  tmpFilePath,
  reporter,
}) => {
  let pipeline
  try {
    pipeline = sharp(file.absolutePath)

    if (!options.rotate) {
      pipeline.rotate()
    }
  } catch (err) {
    reportError(`Failed to process image ${file.absolutePath}`, err, reporter)
    return
  }

  pipeline
    .resize(options.width, options.height, {
      position: options.cropFocus,
    })
    .png({
      compressionLevel: options.pngCompressionLevel,
      adaptiveFiltering: false,
      force: options.toFormat === `png`,
    })
    .jpeg({
      quality: options.quality,
      progressive: options.jpegProgressive,
      force: options.toFormat === `jpg`,
    })

  // grayscale
  if (options.grayscale) {
    pipeline = pipeline.grayscale()
  }

  // rotate
  if (options.rotate && options.rotate !== 0) {
    pipeline = pipeline.rotate(options.rotate)
  }

  // duotone
  if (options.duotone) {
    pipeline = await duotone(options.duotone, options.toFormat, pipeline)
  }

  await new Promise((resolve, reject) =>
    pipeline.toFile(tmpFilePath, err => {
      if (err) {
        return reject(err)
      }
      return resolve()
    })
  )
}

const optimize = svg => {
  const SVGO = require(`svgo`)
  const svgo = new SVGO({
    multipass: true,
    floatPrecision: 0,
    plugins: [
      {
        removeViewBox: false,
      },
      {
        addAttributesToSVGElement: {
          attributes: [
            {
              preserveAspectRatio: `none`,
            },
          ],
        },
      },
    ],
  })
  return svgo.optimize(svg).then(({ data }) => data)
}

exports.notMemoizedtraceSVG = async ({ file, args, fileArgs, reporter }) => {
  throw new Error('Potrace is not supported')
}

let memoizedPrepareTraceSVGInputFile
let memoizedTraceSVG
const createMemoizedFunctions = () => {
  exports.memoizedPrepareTraceSVGInputFile = memoizedPrepareTraceSVGInputFile = _.memoize(
    exports.notMemoizedPrepareTraceSVGInputFile,
    ({ tmpFilePath }) => tmpFilePath
  )

  exports.memoizedTraceSVG = memoizedTraceSVG = _.memoize(
    exports.notMemoizedtraceSVG,
    ({ file, args, fileArgs }) =>
      `${file.internal.contentDigest}${JSON.stringify(args)}${JSON.stringify(
        fileArgs
      )}`
  )
}

// This is very hacky, but memoized function are pretty tricky to spy on
// in tests ;(
createMemoizedFunctions()
exports.createMemoizedFunctions = () => {
  createMemoizedFunctions()
}

exports.clearMemoizeCaches = () => {
  memoizedTraceSVG.cache.clear()
  memoizedPrepareTraceSVGInputFile.cache.clear()
}
