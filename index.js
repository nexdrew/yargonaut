'use strict'

var path = require('path')

var parentRequire = require('parent-require')
var figlet = require('figlet')
var chalk = require('chalk')

module.exports = new Yargonaut()

function Yargonaut () {

  var self = this
  var yargs = hack()
  var fonts = {}
  var styles = {}
  var workaround = {}
  var ocdf = null
  var defaultFont = 'Standard'

  var yargsKeys = {
    // supporting fonts and styles
    'Commands:': { transform: wholeString, error: false },
    'Options:': { transform: wholeString, error: false },
    'Examples:': { transform: wholeString, error: false },
    'Not enough non-option arguments: got %s, need at least %s': { transform: upToFirstColon, error: true },
    'Too many non-option arguments: got %s, maximum of %s': { transform: upToFirstColon, error: true },
    'Missing argument value: %s': { transform: upToFirstColon, error: true, plural: 'Missing argument values: %s' },
    'Missing required argument: %s': { transform: upToFirstColon, error: true, plural: 'Missing required arguments: %s' },
    'Unknown argument: %s': { transform: upToFirstColon, error: true, plural: 'Unknown arguments: %s' },
    'Invalid values:': { transform: wholeString, error: true },
    'Argument check failed: %s': { transform: upToFirstColon, error: true },
    'Implications failed:': { transform: wholeString, error: true },
    'Not enough arguments following: %s': { transform: upToFirstColon, error: true },
    'Invalid JSON config file: %s': { transform: upToFirstColon, error: true },
    // supporting styles only (by default)
    'boolean': { transform: null, error: null },
    'count': { transform: null, error: null },
    'string': { transform: null, error: null },
    'array': { transform: null, error: null },
    'required': { transform: null, error: null },
    'default:': { transform: null, error: null },
    'choices:': { transform: null, error: null },
    'generated-value': { transform: null, error: null },
    'Argument: %s, Given: %s, Choices: %s': { transform: null, error: true }
  }

  // chainable config API methods
  self.help = function (font) {
    applyFont(font, self.getHelpKeys())
    return self
  }

  self.errors = function (font) {
    applyFont(font, self.getErrorKeys())
    return self
  }

  self.font = function (font, key) {
    var keys = key ? [].concat(key) : self.getAllKeys()
    applyFont(font, keys, key !== undefined)
    return self
  }

  self.helpStyle = function (style) {
    applyStyle(style, self.getHelpKeys())
    return self
  }

  self.errorsStyle = function (style) {
    applyStyle(style, self.getErrorKeys())
    return self
  }

  self.style = function (style, key) {
    var keys = key ? [].concat(key) : self.getAllKeys()
    applyStyle(style, keys)
    return self
  }

  self.transformWholeString = function (key) {
    var keys = key ? [].concat(key) : self.getAllKeys()
    applyTransform(wholeString, keys)
    return self
  }

  self.transformUpToFirstColon = function (key) {
    var keys = key ? [].concat(key) : self.getAllKeys()
    applyTransform(upToFirstColon, keys)
    return self
  }

  self.ocd = function (f) {
    if (typeof f === 'function') ocdf = f
    return self
  }

  // getter API methods
  self.getAllKeys = function () {
    return Object.keys(yargsKeys)
  }

  self.getHelpKeys = function () {
    return self.getAllKeys().filter(function (key) {
      return yargsKeys[key].error === false
    })
  }

  self.getErrorKeys = function () {
    return self.getAllKeys().filter(function (key) {
      return yargsKeys[key].error === true
    })
  }

  // methods for playing with fonts
  self.asFont = function (text, font, throwErr) {
    try {
      return figlet.textSync(text, { font: font || defaultFont })
    } catch (err) {
      if (throwErr) throw err
      return text
    }
  }

  self.listFonts = function () {
    return figlet.fontsSync()
  }

  self.printFont = function (font, text, throwErr) {
    font = font || defaultFont
    console.log('Font: ' + font + '\n' + self.asFont(text || font, font, throwErr))
  }

  self.printFonts = function (text, throwErr) {
    self.listFonts().forEach(function (f) {
      self.printFont(f, text, throwErr)
    })
  }

  self.figlet = function () {
    return figlet
  }

  // private transforms
  function wholeString (str) {
    return { render: str, nonRender: '' }
  }

  function upToFirstColon (str) {
    var firstColon = str.indexOf(':') + 1
    return { render: str.substring(0, firstColon), nonRender: '\n  ' + str.substring(firstColon) }
  }

  // private config methods
  function applyStyle (style, keys) {
    if (typeof style !== 'string') return
    keys.forEach(function (k) {
      styles[k] = style
    })
    if (yargs && yargs.updateLocale) applyStyleWorkaround()
  }

  function applyFont (font, keys, force) {
    if (typeof font !== 'string') font = defaultFont
    keys.forEach(function (k) {
      fonts[k] = font
      if (!yargsKeys[k]) yargsKeys[k] = { transform: wholeString, error: null }
      else if (force && yargsKeys[k].transform === null) yargsKeys[k].transform = wholeString
    })
    if (yargs && yargs.updateLocale) applyFontWorkaround()
  }

  function applyStyleWorkaround () {
    Object.keys(styles).forEach(function (k) {
      if (workaround[k]) {
        if (typeof workaround[k] === 'string') workaround[k] = doStyle(k, chalk.stripColor(workaround[k]), styles[k])
        else {
          workaround[k] = {
            one: doStyle(k, chalk.stripColor(workaround[k].one), styles[k]),
            other: doStyle(yargsKeys[k].plural, chalk.stripColor(workaround[k].other), styles[k])
          }
        }
      } else {
        if (yargsKeys[k] && yargsKeys[k].plural) {
          workaround[k] = {
            one: doStyle(k, k, styles[k]),
            other: doStyle(yargsKeys[k].plural, yargsKeys[k].plural, styles[k])
          }
        } else {
          workaround[k] = doStyle(k, k, styles[k])
        }
      }
    })
    yargs.updateLocale(workaround)
  }

  function applyFontWorkaround () {
    Object.keys(fonts).forEach(function (k) {
      if (workaround[k]) {
        if (typeof workaround[k] === 'string') workaround[k] = doRender(k, workaround[k], fonts[k])
        else {
          workaround[k] = {
            one: doRender(k, workaround[k].one, fonts[k]),
            other: doRender(yargsKeys[k].plural, workaround[k].other, fonts[k])
          }
        }
      } else {
        if (yargsKeys[k] && yargsKeys[k].plural) {
          workaround[k] = {
            one: doRender(k, k, fonts[k]),
            other: doRender(yargsKeys[k].plural, yargsKeys[k].plural, fonts[k])
          }
        } else {
          workaround[k] = doRender(k, k, fonts[k])
        }
      }
    })
    yargs.updateLocale(workaround)
  }

  function applyTransform (transform, keys) {
    keys.forEach(function (k) {
      if (!yargsKeys[k]) yargsKeys[k] = { transform: transform, error: null }
      else yargsKeys[k].transform = transform
    })
  }

  // private logic to intercept y18n methods
  function doStyle (key, orig, style) {
    var chain = chalk
    style.split('.').forEach(function (s) {
      if (chain[s]) chain = chain[s]
    })
    return typeof chain === 'function' ? chain(orig) : orig
  }

  function doRender (key, orig, font) {
    var fn = yargsKeys[key] ? yargsKeys[key].transform : upToFirstColon
    if (fn === null) return orig
    var split = fn(orig)
    return self.asFont(split.render, font) + split.nonRender
  }

  function hack () {
    var lookingFor = path.join('yargs', 'node_modules', 'y18n', 'index.js')
    var found = findInModuleCache(lookingFor)

    if (found) {
      // console.log('yargonaut: You loaded yargs before yargonaut, only default locale supported')
      return parentRequireSafe('yargs')
    }

    var Y18n = parentRequireSafe(lookingFor)
    found = findInModuleCache(lookingFor)

    if (!found) {
      // console.log('yargonaut: You're using a version of yargs that does not support string customization')
      return parentRequireSafe('yargs')
    }

    require.cache[found].exports = function (opts) {
      var z18n = new Y18n(opts)
      var singular = z18n.__
      var plural = z18n.__n

      z18n.__ = function () {
        var orig = singular.apply(z18n, arguments)
        var key = arguments[0]
        if (fonts[key] && yargsKeys[key]) {
          return tweak(
            key,
            orig,
            doRender(key, orig, fonts[key]),
            figlet,
            fonts[key]
          )
        }
        return tweak(key, orig, orig, figlet, fonts[key])
      }

      z18n.__n = function () {
        var orig = plural.apply(z18n, arguments)
        var key = arguments[0]
        if (fonts[key] && yargsKeys[key]) {
          return tweak(
            key,
            orig,
            doRender(key, orig, fonts[key]),
            figlet,
            fonts[key]
          )
        }
        return tweak(key, orig, orig, figlet, fonts[key])
      }

      function tweak (key, origString, newString, figlet, font) {
        if (styles[key]) newString = doStyle(key, newString, styles[key])
        return ocdf ? ocdf(key, origString, newString, figlet, font) : newString
      }

      for (var key in z18n) {
        if (typeof z18n[key] === 'function') {
          z18n[key] = z18n[key].bind(z18n)
        }
      }

      return z18n
    }

    return null
  }

  function findInModuleCache (lookingFor) {
    var found = null
    for (var i = 0, files = Object.keys(require.cache); i < files.length; i++) {
      if (~files[i].lastIndexOf(lookingFor)) {
        found = files[i]
        break
      }
    }
    return found
  }

  function parentRequireSafe (m) {
    try {
      return parentRequire(m)
    } catch (err) {
      return null
    }
  }

}
