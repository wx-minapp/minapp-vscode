(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.prettyhtml = f()}})(function(){var define,module,exports;return (function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
  'use strict'

  const unclosedExpression = 'Unclosed expression.'
  const unclosedTemplateLiteral = 'Unclosed ES6 template literal.'
  const unexpectedCharInExpression = 'Unexpected character %1.'

  /**
   * Escape special characters in a given string, in preparation to create a regex.
   *
   * @param   {string} str - Raw string
   * @returns {string} Escaped string.
   */
  const escapeStr = str => str.replace(/(?=[-[\](){^*+?.$|\\])/g, '\\')

  const $_ES6_BQ = '`'

  /*
   * Mini-parser for expressions.
   * The main pourpose of this module is to find the end of an expression
   * and return its text without the enclosing brackets.
   * Does not works with comments, but supports ES6 template strings.
   */
  /**
   * @exports exprExtr
   */
  const S_SQ_STR = /'[^'\n\r\\]*(?:\\(?:\r\n?|[\S\s])[^'\n\r\\]*)*'/.source
  /**
   * Matches double quoted JS strings taking care about nested quotes
   * and EOLs (escaped EOLs are Ok).
   *
   * @const
   * @private
   */
  const S_STRING = `${S_SQ_STR}|${S_SQ_STR.replace(/'/g, '"')}`
  /**
   * Regex cache
   *
   * @type {Object.<string, RegExp>}
   * @const
   * @private
   */
  const reBr = {}
  /**
   * Makes an optimal regex that matches quoted strings, brackets, backquotes
   * and the closing brackets of an expression.
   *
   * @param   {string} b - Closing brackets
   * @returns {RegExp}
   */
  function _regex(b) {
    let re = reBr[b]
    if (!re) {
      let s = escapeStr(b)
      if (b.length > 1) {
        s = s + '|['
      } else {
        s = /[{}[\]()]/.test(b) ? '[' : `[${s}`
      }
      reBr[b] = re = new RegExp(`${S_STRING}|${s}\`/\\{}[\\]()]`, 'g')
    }
    return re
  }

  /**
   * Searches the next backquote that signals the end of the ES6 Template Literal
   * or the "${" sequence that starts a JS expression, skipping any escaped
   * character.
   *
   * @param   {string}    code  - Whole code
   * @param   {number}    pos   - The start position of the template
   * @param   {string[]}  stack - To save nested ES6 TL count
   * @returns {number}    The end of the string (-1 if not found)
   */
  function skipES6TL(code, pos, stack) {
    // we are in the char following the backquote (`),
    // find the next unescaped backquote or the sequence "${"
    const re = /[`$\\]/g
    let c
    while (((re.lastIndex = pos), re.exec(code))) {
      pos = re.lastIndex
      c = code[pos - 1]
      if (c === '`') {
        return pos
      }
      if (c === '$' && code[pos++] === '{') {
        stack.push($_ES6_BQ, '}')
        return pos
      }
      // else this is an escaped char
    }
    throw formatError(code, unclosedTemplateLiteral, pos)
  }

  // safe characters to precced a regex (including `=>`, `**`, and `...`)
  const beforeReChars = '[{(,;:?=|&!^~>%*/'
  const beforeReSign = beforeReChars + '+-'

  // keyword that can preceed a regex (`in` is handled as special case)
  const beforeReWords = [
    'case',
    'default',
    'do',
    'else',
    'in',
    'instanceof',
    'prefix',
    'return',
    'typeof',
    'void',
    'yield'
  ]

  // Last chars of all the beforeReWords elements to speed up the process.
  const wordsEndChar = beforeReWords.reduce((s, w) => s + w.slice(-1), '')

  // Matches literal regex from the start of the buffer.
  // The buffer to search must not include line-endings.
  const RE_LIT_REGEX = /^\/(?=[^*>/])[^[/\\]*(?:(?:\\.|\[(?:\\.|[^\]\\]*)*\])[^[\\/]*)*?\/[gimuy]*/

  // Valid characters for JavaScript variable names and literal numbers.
  const RE_JS_VCHAR = /[$\w]/

  // Match dot characters that could be part of tricky regex
  const RE_DOT_CHAR = /.*/g

  /**
   * Searches the position of the previous non-blank character inside `code`,
   * starting with `pos - 1`.
   *
   * @param   {string} code - Buffer to search
   * @param   {number} pos  - Starting position
   * @returns {number} Position of the first non-blank character to the left.
   * @private
   */
  function _prev(code, pos) {
    while (--pos >= 0 && /\s/.test(code[pos]));
    return pos
  }

  /**
   * Check if the character in the `start` position within `code` can be a regex
   * and returns the position following this regex or `start+1` if this is not
   * one.
   *
   * NOTE: Ensure `start` points to a slash (this is not checked).
   *
   * @function skipRegex
   * @param   {string} code  - Buffer to test in
   * @param   {number} start - Position the first slash inside `code`
   * @returns {number} Position of the char following the regex.
   *
   */
  /* istanbul ignore next */
  function skipRegex(code, start) {
    let pos = (RE_DOT_CHAR.lastIndex = start++)

    // `exec()` will extract from the slash to the end of the line
    //   and the chained `match()` will match the possible regex.
    const match = (RE_DOT_CHAR.exec(code) || ' ')[0].match(RE_LIT_REGEX)

    if (match) {
      const next = pos + match[0].length // result comes from `re.match`

      pos = _prev(code, pos)
      let c = code[pos]

      // start of buffer or safe prefix?
      if (pos < 0 || beforeReChars.includes(c)) {
        return next
      }

      // from here, `pos` is >= 0 and `c` is code[pos]
      if (c === '.') {
        // can be `...` or something silly like 5./2
        if (code[pos - 1] === '.') {
          start = next
        }
      } else {
        if (c === '+' || c === '-') {
          // tricky case
          if (
            code[--pos] !== c || // if have a single operator or
            (pos = _prev(code, pos)) < 0 || // ...have `++` and no previous token
            beforeReSign.includes((c = code[pos]))
          ) {
            return next // ...this is a regex
          }
        }

        if (wordsEndChar.includes(c)) {
          // looks like a keyword?
          const end = pos + 1

          // get the complete (previous) keyword
          while (--pos >= 0 && RE_JS_VCHAR.test(code[pos]));

          // it is in the allowed keywords list?
          if (beforeReWords.includes(code.slice(pos + 1, end))) {
            start = next
          }
        }
      }
    }

    return start
  }

  /**
   * Update the scopes stack removing or adding closures to it
   * @param   {array} stack - array stacking the expression closures
   * @param   {string} char - current char to add or remove from the stack
   * @param   {string} idx  - matching index
   * @param   {string} code - expression code
   * @returns {object} result
   * @returns {object} result.char - either the char received or the closing braces
   * @returns {object} result.index - either a new index to skip part of the source code,
   *                                  or 0 to keep from parsing from the old position
   */
  function updateStack(stack, char, idx, code) {
    let index = 0

    switch (char) {
      case '[':
      case '(':
      case '{':
        stack.push(char === '[' ? ']' : char === '(' ? ')' : '}')
        break
      case ')':
      case ']':
      case '}':
        if (char !== stack.pop()) {
          panic(code, unexpectedCharInExpression.replace('%1', char), index)
        }

        if (char === '}' && stack[stack.length - 1] === $_ES6_BQ) {
          char = stack.pop()
        }

        index = idx + 1
        break
      case '/':
        index = skipRegex(code, idx)
    }

    return { char, index }
  }

  /**
   * Parses the code string searching the end of the expression.
   * It skips braces, quoted strings, regexes, and ES6 template literals.
   *
   * @function exprExtr
   * @param   {string}  code  - Buffer to parse
   * @param   {number}  start - Position of the opening brace
   * @param   {[string,string]} bp - Brackets pair
   * @returns {Object} Expression's end (after the closing brace) or -1
   *                            if it is not an expr.
   */
  function exprExtr(code, start, bp) {
    const [openingBraces, closingBraces] = bp
    const offset = start + openingBraces.length // skips the opening brace
    const stack = [] // expected closing braces ('`' for ES6 TL)
    const re = _regex(closingBraces)

    re.lastIndex = offset // begining of the expression

    let end
    let match

    while ((match = re.exec(code))) {
      const idx = match.index
      const str = match[0]
      end = re.lastIndex

      // end the iteration
      if (str === closingBraces && !stack.length) {
        return {
          text: code.slice(offset, idx),
          start,
          end
        }
      }

      const { char, index } = updateStack(stack, str[0], idx, code)
      // update the end value depending on the new index received
      end = index || end
      // update the regex last index
      re.lastIndex = char === $_ES6_BQ ? skipES6TL(code, end, stack) : end
    }

    if (stack.length) {
      panic(code, unclosedExpression, end)
    }
  }

  /**
   * Creates a regex for the given string and the left bracket.
   * The string is captured in $1.
   *
   * @param   {ParserState} state  - Parser state
   * @param   {string} str - String to search
   * @returns {RegExp} Resulting regex.
   * @private
   */
  function b0re(state, str) {
    const { brackets } = state

    const b0 = escapeStr(brackets[0])
    const b1 = escapeStr(str)

    return new RegExp(`(${b1})|${b0}`, 'g')
  }

  /**
   * Find the end of the attribute value or text node
   * Extract expressions.
   * Detect if value have escaped brackets.
   *
   * @param   {ParserState} state  - Parser state
   * @returns {number} Ending position
   * @private
   */
  function expr(state) {
    const re = b0re(state, state.brackets[1])
    const node = {}

    const { unescape, expressions } = parseExpressions(state, re)

    if (node) {
      if (unescape) {
        node.unescape = unescape
      }
      if (expressions.length) {
        node.expressions = expressions
      }
    }

    return node
  }

  /**
   * Parse a text chunk finding all the expressions in it
   * @param   {ParserState} state  - Parser state
   * @param   {RegExp} re - regex to match the expressions contents
   * @returns {object} result containing the expression found, the string to unescape and the end position
   */
  function parseExpressions(state, re) {
    const { data, brackets } = state
    const expressions = []
    let unescape, pos, match

    // Anything captured in $1 (closing quote or character) ends the loop...
    while ((match = re.exec(data))) {
      // ...else, we have an opening bracket and maybe an expression.
      pos = match.index
      if (data[pos - 1] === '\\') {
        unescape = match[0] // it is an escaped opening brace
      } else {
        const tmpExpr = exprExtr(data, pos, brackets)
        if (tmpExpr) {
          expressions.push(tmpExpr)
          re.lastIndex = tmpExpr.end
        }
      }
    }

    return {
      unescape,
      expressions
    }
  }

  function formatError(data, message, pos) {
    if (!pos) {
      pos = data.length
    }
    // count unix/mac/win eols
    const line = (data.slice(0, pos).match(/\r\n?|\n/g) || '').length + 1
    let col = 0
    while (--pos >= 0 && !/[\r\n]/.test(data[pos])) {
      ++col
    }
    return `[${line},${col}]: ${message}`
  }

  /**
   * Custom error handler can be implemented replacing this method.
   * The `state` object includes the buffer (`data`)
   * The error position (`loc`) contains line (base 1) and col (base 0).
   *
   * @param {string} msg   - Error message
   * @param {pos} [number] - Position of the error
   */
  function panic(data, msg, pos) {
    const message = formatError(data, msg, pos)
    throw new Error(message)
  }

  function parse(data, state) {
    return expr({ ...state, data })
  }

  module.exports = parse

  },{}],2:[function(require,module,exports){
  "use strict";
  const webparser_1 = require("@starptech/webparser");
  const htmlSchema = require('property-information/html');
  const svgSchema = require('property-information/svg');
  const hastSvg = require('@starptech/prettyhtml-hastscript/svg');
  const hast = require('@starptech/prettyhtml-hastscript');
  const GAP_REGEX = /\n\s*?\n\s*?$/;
  function isFakeRoot(obj) {
      return obj.name === ':webparser:root';
  }
  /* Transform a node. */
  function transform(ast, nextAst, config) {
      const schema = config.schema;
      let node;
      if (ast instanceof webparser_1.Element) {
          let children;
          config.schema = getElementNameAndNS(ast.name).ns === 'svg' ? svgSchema : htmlSchema;
          if (ast.children && ast.children.length) {
              children = nodes(ast.children, config);
          }
          if (isFakeRoot(ast)) {
              node = root(ast, children);
          }
          else {
              node = element(ast, children, config);
          }
          node.data = node.data || {};
          node.data.selfClosing =
              ast.startSourceSpan === ast.endSourceSpan && ast.startSourceSpan !== null && ast.endSourceSpan !== null;
          if (isGap(nextAst))
              node.data.gapAfter = true;
      }
      else if (ast instanceof webparser_1.Text) {
          node = text(ast);
      }
      else if (ast instanceof webparser_1.Comment) {
          node = comment(ast);
          if (isGap(nextAst)) {
              node.data = node.data || {};
              node.data.gapAfter = true;
          }
      }
      else if (ast instanceof webparser_1.Doctype) {
          node = {
              type: 'doctype',
              name: 'html',
              public: null,
              system: null
          };
      }
      if (ast instanceof webparser_1.Element) {
          if (ast.startSourceSpan && ast.endSourceSpan) {
              node.position = {
                  start: {
                      // webparser format counts lines beginning from zero
                      line: ++ast.startSourceSpan.start.line,
                      column: ast.startSourceSpan.start.col,
                      offset: ast.startSourceSpan.start.offset
                  },
                  end: {
                      line: ++ast.endSourceSpan.end.line,
                      column: ast.endSourceSpan.end.col,
                      offset: ast.endSourceSpan.end.offset
                  }
              };
          }
      }
      else {
          node.position = {
              start: {
                  line: ++ast.sourceSpan.start.line,
                  column: ast.sourceSpan.start.col,
                  offset: ast.sourceSpan.start.offset
              },
              end: {
                  line: ++ast.sourceSpan.end.line,
                  column: ast.sourceSpan.end.col,
                  offset: ast.sourceSpan.end.offset
              }
          };
      }
      config.schema = schema;
      return node;
  }
  /* Transform children. */
  function nodes(children, config) {
      const length = children.length;
      let index = -1;
      const result = [];
      while (++index < length) {
          const nextChildren = index + 1 < length ? children[index + 1] : null;
          result[index] = transform(children[index], nextChildren, config);
      }
      return result;
  }
  function root(ast, children) {
      return { type: 'root', children, data: {} };
  }
  /* Transform a text. */
  function text(ast) {
      return { type: 'text', value: ast.value };
  }
  /* Transform a comment. */
  function comment(ast) {
      return { type: 'comment', value: ast.value };
  }
  function getAttributeName(attribute) {
      const colons = attribute.name.split(':');
      // attrName from webparser: ":xmlns:xlink"
      // remove first colon because it was added by webparser
      if (attribute.implicitNs === true && colons.length >= 3) {
          return colons.slice(1).join(':');
      }
      return attribute.name;
  }
  function getElementNameAndNS(name, implicitNs = false) {
      const info = webparser_1.splitNsName(name);
      // when a ns was set but no implicit was propagated
      if (implicitNs == false && info[0]) {
          return { ns: info[0], name: info[0] + ':' + info[1] };
      }
      return { ns: info[0], name: info[1] };
  }
  function isGap(el) {
      return el instanceof webparser_1.Text && el.value && GAP_REGEX.test(el.value);
  }
  /* Transform an element. */
  function element(ast, children, config) {
      const fn = config.schema.space === 'svg' ? hastSvg : hast;
      const nameInfo = getElementNameAndNS(ast.name, ast.implicitNs);
      const props = {};
      let node;
      for (const attr of ast.attrs) {
          props[getAttributeName(attr)] = attr.value;
      }
      // hastscript interpret any object with a "value" attribute as
      // unist node. This is a workaround to explicity express it as property.
      if (props.value) {
          props[Symbol.for('hast.isProp')] = true;
      }
      node = fn(nameInfo.name, props, children);
      return node;
  }
  module.exports = function from(rootNodes, options = {}) {
      const sourceSpan = new webparser_1.ParseSourceSpan(null, null);
      const fakeRoot = new webparser_1.Element(':webparser:root', [], rootNodes, false, sourceSpan);
      const result = transform(fakeRoot, null, {
          schema: htmlSchema
      });
      return result;
  };

  },{"@starptech/prettyhtml-hastscript":25,"@starptech/prettyhtml-hastscript/svg":26,"@starptech/webparser":42,"property-information/html":71,"property-information/svg":87}],3:[function(require,module,exports){
  /* eslint no-param-reassign: ["error", { "props": true, "ignorePropertyModificationsFor": ["node"] }] */

  'use strict'

  const minify = require('@starptech/rehype-minify-whitespace')({
    newlines: true
  })
  const sensitive = require('html-whitespace-sensitive-tag-names')
  const is = require('unist-util-is')
  const isElement = require('hast-util-is-element')
  const repeat = require('repeat-string')
  const visit = require('unist-util-visit-parents')
  const voids = require('html-void-elements')
  const find = require('unist-util-find')
  const toString = require('hast-util-to-string')
  const prettier = require('prettier')
  const expressionParser = require('@starptech/expression-parser')

  module.exports = format

  /* Constants. */
  const single = '\n'
  const tab = '\t'
  const double = '\n\n'
  const space = ' '
  const re = /\n/g

  const CONDITIONAL_COMMENT_REGEXP = /^\s*\[if .*/

  /* Format white-space. */
  function format(options) {
    const settings = options || {}
    const tabWidth = settings.tabWidth || 2
    const { useTabs } = settings
    let { indentInitial } = settings
    const usePrettier = settings.usePrettier !== false
    const prettierOpts = settings.prettier
    let indent

    if (useTabs) {
      indent = tab
    } else {
      indent = repeat(space, tabWidth)
    }

    return transform

    function markIgnoreVisitor(node, parents) {
      /**
       * Handle special prettyhtml flags to ignore attribute wrapping and/or whitespace handling
       */
      if (is('comment', node)) {
        if (node.value.indexOf('prettyhtml-ignore') !== -1) {
          return setAttributeOnChildren(node, parents, 'ignore', true)
        }
        if (node.value.indexOf('prettyhtml-preserve-whitespace') !== -1) {
          return setAttributeOnChildren(node, parents, 'preserveWhitespace', true)
        }
        if (node.value.indexOf('prettyhtml-preserve-attribute-wrapping') !== -1) {
          return setAttributeOnChildren(node, parents, 'preserveAttrWrapping', true)
        }
      }
    }

    function setAttributeOnChildren(node, parents, attributeName, attributeValue) {
      const parent = parents[parents.length - 1]
      const nodeIndex = parent ? parent.children.indexOf(node) : null
      if (nodeIndex !== null) {
        for (let i = nodeIndex; i < parent.children.length; i++) {
          const child = parent.children[i]
          if (isElement(child)) {
            setNodeData(child, attributeName, attributeValue)
            return visit.SKIP
          }
        }
      }
    }

    function transform(tree) {
      // check if we are in page mode to indent the first level
      indentInitial = isPageMode(tree)

      visit(tree, markIgnoreVisitor)

      const root = minify(tree)

      visit(root, visitor)

      return root

      function visitor(node, parents) {
        // holds a copy of the children
        const children = node.children || []
        const { length } = children
        let index = -1
        let child
        let level = parents.length

        if (indentInitial === false) {
          level--
        }

        if (node.data && (node.data.ignore || node.data.preserveWhitespace)) {
          return visit.SKIP
        }

        if (is('comment', node)) {
          indentComment(node, indent, level)
        }

        /**
         * If we find whitespace-sensitive nodes / inlines we skip it
         * e.g pre, textarea
         */
        if (ignore(parents.concat(node))) {
          setNodeData(node, 'indentLevel', level - 1)

          // clear empty script, textarea, pre, style tags
          if (length) {
            const empty = hasOnlyEmptyTextChildren(node)
            const isEmbeddedContent = isElement(node, 'style') || isElement(node, 'script')
            if (empty) {
              // eslint-disable-next-line no-param-reassign
              node.children = []
            }
            if (usePrettier && !empty && isEmbeddedContent) {
              prettierEmbeddedContent(node, level, indent, prettierOpts)
            }
          }

          return visit.SKIP
        }

        let newline = false
        // we have to look in the future because we indent leading text
        // on a newline when a child text node contains a newline. If we wouldn't do this
        // the formatter could produce an unstable result because in the next step we could produce newlines.
        const collpased = peekCollpase(node, children)

        /**
         * Indent children
         */
        index = -1
        while (++index < length) {
          // eslint-disable-next-line no-shadow
          const child = children[index]

          // only indent text in nodes
          // root text nodes should't influence other root nodes^^
          if (node.type === 'root') {
            break
          }

          if (is('text', child)) {
            if (containsNewline(child) || collpased) {
              newline = true
            }

            child.value = child.value
              // reduce newlines to one newline
              // $& contains the lastMatch
              .replace(re, `$&${repeat(indent, level)}`)
          }
        }

        // reset
        const result = []
        index = -1
        node.children = result

        let prevChild = null
        if (length) {
          // walk through children
          // hint: a child has no children informations we already walking through
          // the tree
          while (++index < length) {
            child = children[index]

            const indentLevel = level

            setNodeData(child, 'indentLevel', indentLevel)

            if (elementHasGap(prevChild)) {
              result.push({
                type: 'text',
                value: single
              })
            }

            if (
              isElementAfterConditionalComment(node, child, index, prevChild) ||
              isConCommentFollowedByComment(node, child, index, prevChild)
            ) {
              result.push({
                type: 'text',
                value: double + repeat(indent, indentLevel)
              })
            } else if (
              insertNewlineBeforeNode(node, children, child, index, prevChild) ||
              (newline && index === 0)
            ) {
              // only necessary because we are trying to indent tags on newlines
              // even when in inline context when possible
              if (is('text', prevChild)) {
                // remove trailing whitespaces and tabs because a newline is inserted before
                prevChild.value = prevChild.value.replace(/[ \t]+$/, '')
              }
              // remove leading whitespaces and tabs because a newline is inserted before
              if (is('text', child)) {
                child.value = child.value.replace(/^[ \t]+/, '')
              }

              result.push({
                type: 'text',
                value: single + repeat(indent, indentLevel)
              })
            }

            prevChild = child

            result.push(child)
          }
        }

        if (insertNewlineAfterNode(node, prevChild) || newline) {
          result.push({
            type: 'text',
            value: single + repeat(indent, level - 1)
          })
        }
      }
    }
  }

  function endsWithNewline(node) {
    return is('text', node) && node.value && /\s*\n\s*$/.test(node.value)
  }

  function startsWithNewline(node) {
    return is('text', node) && node.value && /^\s*\n/.test(node.value)
  }

  function containsNewline(node) {
    return node.value.indexOf(single) !== -1
  }

  /**
   * indent last line of comment
   * e.g
   * <!--
   *   foo
   *    -->
   * to
   * <!--
   *   foo
   * -->
   */
  function indentComment(node, indent, level) {
    const commentLines = node.value.split(single)
    if (commentLines.length > 1) {
      commentLines[commentLines.length - 1] =
        repeat(indent, level - 1) + commentLines[commentLines.length - 1].trim()
      node.value = commentLines.join(single)
    }
  }

  function handleTemplateExpression(child, children) {
    const brackets = checkForTemplateExpression(child.value)
    if (brackets) {
      // dont touch nodes with single text element
      if (
        hasOnlyTextChildren({
          children
        })
      ) {
        return false
      }

      // dont add newline when newline is already in text
      if (startsWithNewline(child)) {
        return false
      }

      return true
    }
  }

  /**
   * Check if any children will be wrapped on a newline
   * @param {*} node
   * @param {*} children
   */
  function peekCollpase(node, children) {
    let index = -1
    let prevChild = false
    while (++index < children.length) {
      const child = children[index]
      if (insertNewlineBeforeNode(node, children, child, index, prevChild)) {
        return true
      }
      prevChild = child
    }
  }

  function insertNewlineBeforeNode(node, children, child, index, prev) {
    // don't add newline when prev child already has one
    if (endsWithNewline(prev)) {
      return false
    }

    // every template expression is indented on a newline
    if (is('text', child) && handleTemplateExpression(child, children)) {
      return true
    }

    // insert newline when tag is on the same line as the comment
    if (is('comment', prev)) {
      return true
    }

    // embedded content is indented on newlines
    if (isElement(child, ['script', 'style']) && index !== 0) {
      return true
    }

    // don't add newline on the first element of the page
    const isRootElement = node.type === 'root' && index === 0
    if (isRootElement) {
      return false
    }
    const isChildTextElement = is('text', child)

    return !isChildTextElement
  }

  function insertNewlineAfterNode(node, prev) {
    // Add newline on the close tag after root element
    const isRootElement = node.type === 'root'
    if (isRootElement) {
      return true
    }

    const hasChilds = node.children.length > 0

    /**
     * e.g <label><input/>foo</label>
     */
    if (hasChilds && !hasOnlyTextChildren(node) && !isVoid(node)) {
      return true
    }

    /**
     * e.g <label>foo</label>
     */
    const isPrevTextNode = is('text', prev)
    return hasChilds && !isVoid(node) && !isPrevTextNode
  }

  function checkForTemplateExpression(value) {
    let result = expressionParser(value, { brackets: ['{{', '}}'] })
    // e.g angular, vue
    if (result.expressions && result.expressions.length) {
      return ['{{', '}}']
    }

    result = expressionParser(value, { brackets: ['{', '}'] })
    // e.g svelte, riotjs
    if (result.expressions && result.expressions.length) {
      return ['{', '}']
    }

    return null
  }

  function hasOnlyTextChildren(node) {
    const children = node.children || []

    if (children.length === 0) {
      return false
    }

    return children.every(n => is('text', n))
  }

  function hasOnlyEmptyTextChildren(node) {
    const children = node.children || []

    if (children.length === 0) {
      return false
    }

    return children.every(n => is('text', n) && /^\s+$/.test(n.value))
  }

  function isElementAfterConditionalComment(node, child, index, prev) {
    // insert double newline when conditional comment is before element
    if (is('comment', prev) && CONDITIONAL_COMMENT_REGEXP.test(prev.value) && isElement(child)) {
      return true
    }
    return false
  }

  function isConCommentFollowedByComment(node, child, index, prev) {
    // insert double newline when conditional comment is before a non conditional comment
    if (
      is('comment', prev) &&
      CONDITIONAL_COMMENT_REGEXP.test(prev.value) &&
      is('comment', child) &&
      !CONDITIONAL_COMMENT_REGEXP.test(child.value)
    ) {
      return true
    }
    return false
  }

  function elementHasGap(prev) {
    // insert double newline when there was an intended gap before the element in original document
    return prev && prev.data.gapAfter
  }

  function isVoid(node) {
    return voids.indexOf(node.tagName) !== -1
  }

  function ignore(nodes) {
    let index = nodes.length

    while (index--) {
      if (sensitive.indexOf(nodes[index].tagName) !== -1) {
        return true
      }
    }

    return false
  }

  function prettierEmbeddedContent(node, level, indent, prettierOpts) {
    const isStyleTag = isElement(node, 'style')
    const isScriptTag = isElement(node, 'script')
    let content = toString(node)
    const type = node.properties.type ? `type="${node.properties.type}"` : ''

    if (isScriptTag) {
      content = `<script ${type}>${content}</script>`
    } else if (isStyleTag) {
      content = `<style ${type}>${content}</style>`
    }

    let formattedText = prettier.format(
      content,
      Object.assign({}, prettierOpts, {
        parser: 'html'
      })
    )

    if (isScriptTag) {
      formattedText = formattedText.replace(/^<script.*>\n*/, '').replace(/<\/script\s*>\s*$/, '')
    } else if (isStyleTag) {
      formattedText = formattedText.replace(/^<style.*>\n*/, '').replace(/<\/style\s*>\s*$/, '')
    }

    node.children = [
      {
        type: 'text',
        value: single
      },
      {
        type: 'text',
        value: formattedText
      },
      {
        type: 'text',
        value: repeat(indent, level - 1)
      }
    ]
    return formattedText
  }

  function setNodeData(node, key, value) {
    const data = node.data || {}
    node.data = data
    node.data[key] = value
  }

  function isPageMode(ast) {
    return !find(ast, function findCondition(node) {
      return isElement(node, ['html', 'body', 'head'])
    })
  }

  },{"@starptech/expression-parser":1,"@starptech/rehype-minify-whitespace":29,"hast-util-is-element":55,"hast-util-to-string":57,"html-void-elements":59,"html-whitespace-sensitive-tag-names":60,"prettier":46,"repeat-string":88,"unist-util-find":98,"unist-util-is":99,"unist-util-visit-parents":102}],4:[function(require,module,exports){
  'use strict'

  const xtend = require('xtend')
  const toHTML = require('@starptech/prettyhtml-hast-to-html')

  module.exports = stringify

  function stringify(config) {
    const settings = xtend(config, this.data('settings'))

    this.Compiler = compiler

    function compiler(tree) {
      return toHTML(tree, settings)
    }
  }

  },{"@starptech/prettyhtml-hast-to-html":5,"xtend":110}],5:[function(require,module,exports){
  'use strict'
  module.exports = require('./lib')

  },{"./lib":11}],6:[function(require,module,exports){
  'use strict'

  var one = require('./one')
  var sensitive = require('html-whitespace-sensitive-tag-names')

  module.exports = all

  /* Stringify all children of `parent`. */
  function all(ctx, parent) {
    var children = parent && parent.children
    var length = children && children.length
    var index = -1
    var results = []

    let printWidthOffset = 0
    let innerTextLength = 0
    while (++index < length) {
      innerTextLength = getInnerTextLength(children[index])
      results[index] = one(ctx, children[index], index, parent, printWidthOffset, innerTextLength)
      printWidthOffset = results[index].replace(/\n+/g, '').length
    }

    return results.join('')
  }

  /**
   * Returns the text lenght of the first line of the first child.
   * Whitespace sensitive elements are ignored.
   * @param {*} node
   */
  function getInnerTextLength(node) {
    // ignore style, script, pre, textarea elements
    if (sensitive.indexOf(node.tagName) !== -1) {
      return 0
    }

    if (!node.children || !node.children.length) {
      return 0
    }

    var child = node.children[0]

    if (child.type === 'text' || child.type === 'comment') {
      return child.value.split('\n')[0].length
    }

    return 0
  }

  },{"./one":20,"html-whitespace-sensitive-tag-names":60}],7:[function(require,module,exports){
  'use strict'

  module.exports = comment

  /* Stringify a comment `node`. */
  function comment(ctx, node) {
    return '<!--' + node.value + '-->'
  }

  },{}],8:[function(require,module,exports){
  'use strict'

  // Characters.
  var NULL = '\0'
  var AMP = '&'
  var SP = ' '
  var TB = '\t'
  var GR = '`'
  var DQ = '"'
  var SQ = "'"
  var EQ = '='
  var LT = '<'
  var GT = '>'
  var SO = '/'
  var LF = '\n'
  var CR = '\r'
  var FF = '\f'

  var whitespace = [SP, TB, LF, CR, FF]
  // https://html.spec.whatwg.org/#attribute-name-state
  var name = whitespace.concat(AMP, SO, GT, EQ)
  // https://html.spec.whatwg.org/#attribute-value-(unquoted)-state
  var unquoted = whitespace.concat(AMP, GT)
  var unquotedSafe = unquoted.concat(NULL, DQ, SQ, LT, EQ, GR)
  // https://html.spec.whatwg.org/#attribute-value-(single-quoted)-state
  var singleQuoted = [AMP, SQ]
  // https://html.spec.whatwg.org/#attribute-value-(double-quoted)-state
  var doubleQuoted = [AMP, DQ]

  // Maps of subsets. Each value is a matrix of tuples.
  // The first value causes parse errors, the second is valid.
  // Of both values, the first value is unsafe, and the second is safe.
  module.exports = {
    name: [[name, name.concat(DQ, SQ, GR)], [name.concat(NULL, DQ, SQ, LT), name.concat(NULL, DQ, SQ, LT, GR)]],
    unquoted: [[unquoted, unquotedSafe], [unquotedSafe, unquotedSafe]],
    single: [
      [singleQuoted, singleQuoted.concat(DQ, GR)],
      [singleQuoted.concat(NULL), singleQuoted.concat(NULL, DQ, GR)]
    ],
    double: [
      [doubleQuoted, doubleQuoted.concat(SQ, GR)],
      [doubleQuoted.concat(NULL), doubleQuoted.concat(NULL, SQ, GR)]
    ]
  }

  },{}],9:[function(require,module,exports){
  'use strict'

  module.exports = doctype

  /* Stringify a doctype `node`. */
  function doctype(ctx, node) {
    var sep = ctx.tightDoctype ? '' : ' '
    var name = node.name
    var pub = node.public
    var sys = node.system
    var val = ['<!doctype']

    if (name) {
      val.push(sep, name)

      if (pub != null) {
        val.push(' public', sep, smart(pub))
      } else if (sys != null) {
        val.push(' system')
      }

      if (sys != null) {
        val.push(sep, smart(sys))
      }
    }

    return val.join('') + '>'
  }

  function smart(value) {
    var quote = value.indexOf('"') === -1 ? '"' : "'"
    return quote + value + quote
  }

  },{}],10:[function(require,module,exports){
  'use strict'

  var xtend = require('xtend')
  var svg = require('property-information/svg')
  var find = require('property-information/find')
  var spaces = require('space-separated-tokens').stringify
  var commas = require('comma-separated-tokens').stringify
  var entities = require('stringify-entities')
  var all = require('./all')
  var constants = require('./constants')
  const repeat = require('repeat-string')

  module.exports = element

  /* Constants. */
  var emptyString = ''

  /* Characters. */
  var space = ' '
  var quotationMark = '"'
  var apostrophe = "'"
  var equalsTo = '='
  var lessThan = '<'
  var greaterThan = '>'
  var slash = '/'
  var newLine = '\n'

  /* Stringify an element `node`. */
  function element(ctx, node, index, parent, printWidthOffset, innerTextLength) {
    var parentSchema = ctx.schema
    var name = node.tagName
    var value = ''
    var selfClosing
    var close
    var omit
    var root = node
    var content
    var attrs
    var indentLevel = getNodeData(node, 'indentLevel', 0)
    var printContext = {
      offset: printWidthOffset,
      wrapAttributes: false,
      indentLevel
    }
    var isVoid = ctx.voids.indexOf(name) !== -1
    var ignoreAttrCollapsing =
      getNodeData(node, 'ignore', false) || getNodeData(node, 'preserveAttrWrapping', false)

    if (parentSchema.space === 'html' && name === 'svg') {
      ctx.schema = svg
    }

    if (ctx.schema.space === 'svg') {
      omit = false
      close = true
      selfClosing = ctx.closeEmpty
    } else {
      omit = ctx.omit
      close = ctx.close
      selfClosing = isVoid
    }

    // check for 'selfClosing' property set by hast-util-from-webparser package
    // in order to support custom self-closing elements
    if (selfClosing === false) {
      selfClosing = getNodeData(node, 'selfClosing', false)
    }

    // <
    printContext.offset += lessThan.length

    // tagName length
    printContext.offset += node.tagName.length

    // / closing tag
    if (selfClosing && !isVoid) {
      printContext.offset += slash.length
    }

    // >
    printContext.offset += greaterThan.length

    const propertyCount = Object.keys(node.properties).length

    // force to wrap attributes on multiple lines when the node contains
    // more than one attribute
    if (propertyCount > 1 && ctx.wrapAttributes) {
      printContext.wrapAttributes = true
    }

    // one space before each attribute
    if (propertyCount) {
      printContext.offset += propertyCount * space.length
    }

    // represent the length of the inner text of the node
    printContext.offset += innerTextLength

    attrs = attributes(ctx, node.properties, printContext, ignoreAttrCollapsing)

    const shouldCollapse = ignoreAttrCollapsing === false && printContext.wrapAttributes

    content = all(ctx, root)

    /* If the node is categorised as void, but it has
     * children, remove the categorisation.  This
     * enables for example `menuitem`s, which are
     * void in W3C HTML but not void in WHATWG HTML, to
     * be stringified properly. */
    selfClosing = content ? false : selfClosing

    if (attrs || !omit || !omit.opening(node, index, parent)) {
      value = lessThan + name

      if (attrs) {
        // add no space after tagName when element is collapsed
        if (shouldCollapse) {
          value += attrs
        } else {
          value += space + attrs
        }
      }

      let selfClosed = false

      // check if the should close self-closing elements
      if (selfClosing && close) {
        if ((!ctx.tightClose || attrs.charAt(attrs.length - 1) === slash) && !shouldCollapse) {
          value += space
        }

        if (shouldCollapse) {
          value += newLine + repeat(ctx.tabWidth, printContext.indentLevel)
        }

        selfClosed = true
        value += slash
      }

      // allow any element to self close itself except known HTML void elements
      else if (selfClosing && !isVoid) {
        if (shouldCollapse) {
          value += newLine + repeat(ctx.tabWidth, printContext.indentLevel)
        }

        selfClosed = true
        value += slash
      }

      // add newline when element should be wrappend on multiple lines and when
      // it's no self-closing element because in that case the newline was already added before the slash (/)
      if (shouldCollapse && !selfClosed) {
        value += newLine + repeat(ctx.tabWidth, printContext.indentLevel)
      }

      value += greaterThan
    }

    value += content

    if (!selfClosing && (!omit || !omit.closing(node, index, parent))) {
      value += lessThan + slash + name + greaterThan
    }

    ctx.schema = parentSchema

    return value
  }

  /* Stringify all attributes. */
  function attributes(ctx, props, printContext, ignoreIndent) {
    var values = []
    var key
    var value
    var result
    var length
    var index
    var last

    for (key in props) {
      value = props[key]

      if (value == null) {
        continue
      }

      result = attribute(ctx, key, value)

      printContext.offset += result.length

      if (ignoreIndent === false && printContext.offset > ctx.printWidth) {
        printContext.wrapAttributes = true
      }

      if (result) {
        values.push(result)
      }
    }

    length = values.length
    index = -1

    while (++index < length) {
      result = values[index]
      last = null

      /* In tight mode, don’t add a space after quoted attributes. */
      if (last !== quotationMark && last !== apostrophe) {
        if (printContext.wrapAttributes) {
          values[index] = newLine + repeat(ctx.tabWidth, printContext.indentLevel + 1) + result
        } else if (index !== length - 1) {
          values[index] = result + space
        } else {
          values[index] = result
        }
      }
    }

    return values.join(emptyString)
  }

  /* Stringify one attribute. */
  function attribute(ctx, key, value) {
    var schema = ctx.schema
    var info = find(schema, key)
    var name = info.attribute

    if (value == null || (typeof value === 'number' && isNaN(value)) || (value === false && info.boolean)) {
      return emptyString
    }

    name = attributeName(ctx, name)

    if ((value === true && info.boolean) || (value === true && info.overloadedBoolean)) {
      return name
    }

    return name + attributeValue(ctx, key, value, info)
  }

  /* Stringify the attribute name. */
  function attributeName(ctx, name) {
    // Always encode without parse errors in non-HTML.
    var valid = ctx.schema.space === 'html' ? ctx.valid : 1
    var subset = constants.name[valid][ctx.safe]

    return entities(name, xtend(ctx.entities, { subset: subset }))
  }

  /* Stringify the attribute value. */
  function attributeValue(ctx, key, value, info) {
    var quote = ctx.quote

    if (typeof value === 'object' && 'length' in value) {
      /* `spaces` doesn’t accept a second argument, but it’s
       * given here just to keep the code cleaner. */
      value = (info.commaSeparated ? commas : spaces)(value, {
        padLeft: !ctx.tightLists
      })
    }

    value = String(value)

    // When attr has no value we avoid quoting
    if (value === '') {
      return value
    } else {
      value = equalsTo + quote + value + quote
    }

    return value
  }

  function getNodeData(node, key, defaultValue) {
    let data = node.data || {}
    return data[key] || defaultValue
  }

  },{"./all":6,"./constants":8,"comma-separated-tokens":50,"property-information/find":70,"property-information/svg":87,"repeat-string":88,"space-separated-tokens":90,"stringify-entities":92,"xtend":110}],11:[function(require,module,exports){
  'use strict'

  var html = require('property-information/html')
  var svg = require('property-information/svg')
  var voids = require('html-void-elements')
  var omission = require('./omission')
  var one = require('./one')
  const repeat = require('repeat-string')

  module.exports = toHTML

  /* Characters. */
  var DQ = '"'
  var SQ = "'"

  /* Stringify the given HAST node. */
  function toHTML(node, options) {
    var settings = options || {}
    var quote = settings.singleQuote ? SQ : DQ
    var printWidth = settings.printWidth === undefined ? 80 : settings.printWidth
    var useTabs = settings.useTabs
    var tabWidth = settings.tabWidth || 2
    var wrapAttributes = settings.wrapAttributes

    if (useTabs) {
      tabWidth = '\t'
    } else if (typeof tabWidth === 'number') {
      tabWidth = repeat(' ', tabWidth)
    }

    return one(
      {
        valid: settings.allowParseErrors ? 0 : 1,
        safe: settings.allowDangerousCharacters ? 0 : 1,
        schema: settings.space === 'svg' ? svg : html,
        omit: settings.omitOptionalTags && omission,
        quote: quote,
        printWidth: printWidth,
        tabWidth: tabWidth,
        wrapAttributes: wrapAttributes,
        tightDoctype: Boolean(settings.tightDoctype),
        tightLists: settings.tightCommaSeparatedLists,
        voids: settings.voids || voids.concat(),
        entities: settings.entities || {},
        close: settings.closeSelfClosing,
        tightClose: settings.tightSelfClosing,
        closeEmpty: settings.closeEmptyElements
      },
      node
    )
  }

  },{"./omission":13,"./one":20,"html-void-elements":59,"property-information/html":71,"property-information/svg":87,"repeat-string":88}],12:[function(require,module,exports){
  'use strict'

  var is = require('unist-util-is')
  var element = require('hast-util-is-element')
  var whiteSpaceLeft = require('./util/white-space-left')
  var after = require('./util/siblings').after
  var omission = require('./omission')

  var optionGroup = 'optgroup'
  var options = ['option'].concat(optionGroup)
  var dataListItem = ['dt', 'dd']
  var listItem = 'li'
  var menuContent = ['menuitem', 'hr', 'menu']
  var ruby = ['rp', 'rt']
  var tableContainer = ['tbody', 'tfoot']
  var tableRow = 'tr'
  var tableCell = ['td', 'th']

  var confusingParagraphParent = ['a', 'audio', 'del', 'ins', 'map', 'noscript', 'video']

  var clearParagraphSibling = [
    'address',
    'article',
    'aside',
    'blockquote',
    'details',
    'div',
    'dl',
    'fieldset',
    'figcaption',
    'figure',
    'footer',
    'form',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'header',
    'hgroup',
    'hr',
    'main',
    'menu',
    'nav',
    'ol',
    'p',
    'pre',
    'section',
    'table',
    'ul'
  ]

  module.exports = omission({
    html: html,
    head: headOrColgroupOrCaption,
    body: body,
    p: p,
    li: li,
    dt: dt,
    dd: dd,
    rt: rubyElement,
    rp: rubyElement,
    optgroup: optgroup,
    option: option,
    menuitem: menuitem,
    colgroup: headOrColgroupOrCaption,
    caption: headOrColgroupOrCaption,
    thead: thead,
    tbody: tbody,
    tfoot: tfoot,
    tr: tr,
    td: cells,
    th: cells
  })

  /* Macro for `</head>`, `</colgroup>`, and `</caption>`. */
  function headOrColgroupOrCaption(node, index, parent) {
    var next = after(parent, index, true)
    return !next || (!is('comment', next) && !whiteSpaceLeft(next))
  }

  /* Whether to omit `</html>`. */
  function html(node, index, parent) {
    var next = after(parent, index)
    return !next || !is('comment', next)
  }

  /* Whether to omit `</body>`. */
  function body(node, index, parent) {
    var next = after(parent, index)
    return !next || !is('comment', next)
  }

  /* Whether to omit `</p>`. */
  function p(node, index, parent) {
    var next = after(parent, index)
    return next ? element(next, clearParagraphSibling) : !parent || !element(parent, confusingParagraphParent)
  }

  /* Whether to omit `</li>`. */
  function li(node, index, parent) {
    var next = after(parent, index)
    return !next || element(next, listItem)
  }

  /* Whether to omit `</dt>`. */
  function dt(node, index, parent) {
    var next = after(parent, index)
    return next && element(next, dataListItem)
  }

  /* Whether to omit `</dd>`. */
  function dd(node, index, parent) {
    var next = after(parent, index)
    return !next || element(next, dataListItem)
  }

  /* Whether to omit `</rt>` or `</rp>`. */
  function rubyElement(node, index, parent) {
    var next = after(parent, index)
    return !next || element(next, ruby)
  }

  /* Whether to omit `</optgroup>`. */
  function optgroup(node, index, parent) {
    var next = after(parent, index)
    return !next || element(next, optionGroup)
  }

  /* Whether to omit `</option>`. */
  function option(node, index, parent) {
    var next = after(parent, index)
    return !next || element(next, options)
  }

  /* Whether to omit `</menuitem>`. */
  function menuitem(node, index, parent) {
    var next = after(parent, index)
    return !next || element(next, menuContent)
  }

  /* Whether to omit `</thead>`. */
  function thead(node, index, parent) {
    var next = after(parent, index)
    return next && element(next, tableContainer)
  }

  /* Whether to omit `</tbody>`. */
  function tbody(node, index, parent) {
    var next = after(parent, index)
    return !next || element(next, tableContainer)
  }

  /* Whether to omit `</tfoot>`. */
  function tfoot(node, index, parent) {
    return !after(parent, index)
  }

  /* Whether to omit `</tr>`. */
  function tr(node, index, parent) {
    var next = after(parent, index)
    return !next || element(next, tableRow)
  }

  /* Whether to omit `</td>` or `</th>`. */
  function cells(node, index, parent) {
    var next = after(parent, index)
    return !next || element(next, tableCell)
  }

  },{"./omission":14,"./util/siblings":18,"./util/white-space-left":19,"hast-util-is-element":55,"unist-util-is":99}],13:[function(require,module,exports){
  'use strict'
  exports.opening = require('./opening')
  exports.closing = require('./closing')

  },{"./closing":12,"./opening":15}],14:[function(require,module,exports){
  'use strict'

  module.exports = omission

  var own = {}.hasOwnProperty

  /* Factory to check if a given node can have a tag omitted. */
  function omission(handlers) {
    return omit

    /* Check if a given node can have a tag omitted.   */
    function omit(node, index, parent) {
      var name = node.tagName
      var fn = own.call(handlers, name) ? handlers[name] : false

      return fn ? fn(node, index, parent) : false
    }
  }

  },{}],15:[function(require,module,exports){
  'use strict'

  var is = require('unist-util-is')
  var element = require('hast-util-is-element')
  var before = require('./util/siblings').before
  var first = require('./util/first')
  var place = require('./util/place')
  var whiteSpaceLeft = require('./util/white-space-left')
  var closing = require('./closing')
  var omission = require('./omission')

  var own = {}.hasOwnProperty

  var uniqueHeadMetadata = ['title', 'base']
  var meta = ['meta', 'link', 'script', 'style', 'template']
  var tableContainers = ['thead', 'tbody']
  var tableRow = 'tr'

  module.exports = omission({
    html: html,
    head: head,
    body: body,
    colgroup: colgroup,
    tbody: tbody
  })

  /* Whether to omit `<html>`. */
  function html(node) {
    var head = first(node)
    return !head || !is('comment', head)
  }

  /* Whether to omit `<head>`. */
  function head(node) {
    var children = node.children
    var length = children.length
    var map = {}
    var index = -1
    var child
    var name

    while (++index < length) {
      child = children[index]
      name = child.tagName

      if (element(child, uniqueHeadMetadata)) {
        if (own.call(map, name)) {
          return false
        }

        map[name] = true
      }
    }

    return Boolean(length)
  }

  /* Whether to omit `<body>`. */
  function body(node) {
    var head = first(node, true)

    return !head || (!is('comment', head) && !whiteSpaceLeft(head) && !element(head, meta))
  }

  /* Whether to omit `<colgroup>`.
   * The spec describes some logic for the opening tag,
   * but it’s easier to implement in the closing tag, to
   * the same effect, so we handle it there instead. */
  function colgroup(node, index, parent) {
    var prev = before(parent, index)
    var head = first(node, true)

    /* Previous colgroup was already omitted. */
    if (element(prev, 'colgroup') && closing(prev, place(parent, prev), parent)) {
      return false
    }

    return head && element(head, 'col')
  }

  /* Whether to omit `<tbody>`. */
  function tbody(node, index, parent) {
    var prev = before(parent, index)
    var head = first(node)

    /* Previous table section was already omitted. */
    if (element(prev, tableContainers) && closing(prev, place(parent, prev), parent)) {
      return false
    }

    return head && element(head, tableRow)
  }

  },{"./closing":12,"./omission":14,"./util/first":16,"./util/place":17,"./util/siblings":18,"./util/white-space-left":19,"hast-util-is-element":55,"unist-util-is":99}],16:[function(require,module,exports){
  'use strict'

  var after = require('./siblings').after

  module.exports = first

  /* Get the first child in `parent`. */
  function first(parent, includeWhiteSpace) {
    return after(parent, -1, includeWhiteSpace)
  }

  },{"./siblings":18}],17:[function(require,module,exports){
  'use strict'

  module.exports = place

  /* Get the position of `node` in `parent`. */
  function place(parent, child) {
    return parent && parent.children && parent.children.indexOf(child)
  }

  },{}],18:[function(require,module,exports){
  'use strict'

  var whiteSpace = require('hast-util-whitespace')

  exports.before = siblings(-1)
  exports.after = siblings(1)

  /* Factory to check siblings in a direction. */
  function siblings(increment) {
    return sibling

    /* Find applicable siblings in a direction.   */
    function sibling(parent, index, includeWhiteSpace) {
      var siblings = parent && parent.children
      var next

      index += increment
      next = siblings && siblings[index]

      if (!includeWhiteSpace) {
        while (next && whiteSpace(next)) {
          index += increment
          next = siblings[index]
        }
      }

      return next
    }
  }

  },{"hast-util-whitespace":58}],19:[function(require,module,exports){
  'use strict'

  var is = require('unist-util-is')
  var whiteSpace = require('hast-util-whitespace')

  module.exports = whiteSpaceLeft

  /* Check if `node` starts with white-space. */
  function whiteSpaceLeft(node) {
    return is('text', node) && whiteSpace(node.value.charAt(0))
  }

  },{"hast-util-whitespace":58,"unist-util-is":99}],20:[function(require,module,exports){
  'use strict'

  module.exports = one

  var own = {}.hasOwnProperty

  var handlers = {}

  handlers.root = require('./all')
  handlers.text = require('./text')
  handlers.element = require('./element')
  handlers.doctype = require('./doctype')
  handlers.comment = require('./comment')
  handlers.raw = require('./raw')

  /* Stringify `node`. */
  function one(ctx, node, index, parent, printWidthOffset, innerTextLength) {
    var type = node && node.type

    if (!type) {
      throw new Error('Expected node, not `' + node + '`')
    }

    if (!own.call(handlers, type)) {
      throw new Error('Cannot compile unknown node `' + type + '`')
    }

    return handlers[type](ctx, node, index, parent, printWidthOffset, innerTextLength)
  }

  },{"./all":6,"./comment":7,"./doctype":9,"./element":10,"./raw":21,"./text":22}],21:[function(require,module,exports){
  'use strict'

  module.exports = raw

  /* Stringify `raw`. */
  function raw(ctx, node) {
    return node.value
  }

  },{}],22:[function(require,module,exports){
  'use strict'

  module.exports = text

  /* Stringify `text`. */
  function text(ctx, node, index, parent) {
    var value = node.value

    return value
  }

  },{}],23:[function(require,module,exports){
  'use strict'

  var find = require('property-information/find')
  var parseSelector = require('hast-util-parse-selector')
  var spaces = require('space-separated-tokens').parse
  var commas = require('comma-separated-tokens').parse

  module.exports = factory

  function factory(schema, defaultTagName) {
    return h

    /* Hyperscript compatible DSL for creating virtual HAST trees. */
    function h(selector, properties, children) {
      var node = parseSelector(selector, defaultTagName)
      var property

      if (!children && properties && !properties[Symbol.for('hast.isProp')] && isChildren(properties, node)) {
        children = properties
        properties = null
      }

      if (properties) {
        for (property in properties) {
          addProperty(node.properties, property, properties[property])
        }
      }

      addChild(node.children, children)

      return node
    }

    function addProperty(properties, key, value) {
      var info
      var property
      var result

      /* Ignore nully and NaN values. */
      // eslint-disable-next-line no-self-compare
      if (value === null || value === undefined || value !== value) {
        return
      }

      info = find(schema, key)
      property = info.property
      result = value

      /* Handle list values. */
      if (typeof result === 'string') {
        if (info.spaceSeparated) {
          result = spaces(result)
        } else if (info.commaSeparated) {
          result = commas(result)
        } else if (info.commaOrSpaceSeparated) {
          result = spaces(commas(result).join(' '))
        }
      }

      /* Accept `object` on style. */
      if (property === 'style' && typeof value !== 'string') {
        result = style(result)
      }

      /* Class-names (which can be added both on the `selector` and here). */
      if (property === 'className' && properties.className) {
        result = properties.className.concat(result)
      }

      properties[property] = parsePrimitives(info, property, result)
    }
  }

  // Value can be: string for text node, array for chilNodes
  function isChildren(value, node) {
    return typeof value === 'string' || 'length' in value || isNode(node.tagName, value)
  }

  function isNode(tagName, value) {
    var type = value.type

    if (tagName === 'input' || !type || typeof type !== 'string') {
      return false
    }

    if (typeof value.children === 'object' && 'length' in value.children) {
      return true
    }

    type = type.toLowerCase()

    if (tagName === 'button') {
      return type !== 'menu' && type !== 'submit' && type !== 'reset' && type !== 'button'
    }

    return 'value' in value
  }

  function addChild(nodes, value) {
    var index
    var length

    if (value === null || value === undefined) {
      return
    }

    if (typeof value === 'string' || typeof value === 'number') {
      nodes.push({ type: 'text', value: String(value) })
      return
    }

    if (typeof value === 'object' && 'length' in value) {
      index = -1
      length = value.length

      while (++index < length) {
        addChild(nodes, value[index])
      }

      return
    }

    if (typeof value !== 'object' || !('type' in value)) {
      throw new Error('Expected node, nodes, or string, got `' + value + '`')
    }

    nodes.push(value)
  }

  /* Parse a (list of) primitives. */
  function parsePrimitives(info, name, value) {
    var index
    var length
    var result

    if (typeof value !== 'object' || !('length' in value)) {
      return parsePrimitive(info, name, value)
    }

    length = value.length
    index = -1
    result = []

    while (++index < length) {
      result[index] = parsePrimitive(info, name, value[index])
    }

    return result
  }

  /* Parse a single primitives. */
  function parsePrimitive(info, name, value) {
    var result = value

    if (info.number || info.positiveNumber) {
      if (!isNaN(result) && result !== '') {
        result = Number(result)
      }
    } else if (info.boolean || info.overloadedBoolean) {
      /* Accept `boolean` and `string`. */
      if (typeof result === 'string' && result === '') {
        result = true
      }
    }

    return result
  }

  function style(value) {
    var result = []
    var key

    for (key in value) {
      result.push([key, value[key]].join(': '))
    }

    return result.join('; ')
  }

  },{"comma-separated-tokens":50,"hast-util-parse-selector":56,"property-information/find":70,"space-separated-tokens":90}],24:[function(require,module,exports){
  'use strict'

  var schema = require('property-information/html')
  var factory = require('./factory')

  var html = factory(schema, 'div')
  html.displayName = 'html'

  module.exports = html

  },{"./factory":23,"property-information/html":71}],25:[function(require,module,exports){
  'use strict'

  module.exports = require('./html')

  },{"./html":24}],26:[function(require,module,exports){
  'use strict'

  var schema = require('property-information/svg')
  var factory = require('./factory')

  var svg = factory(schema, 'g')
  svg.displayName = 'svg'

  module.exports = svg

  },{"./factory":23,"property-information/svg":87}],27:[function(require,module,exports){
  'use strict'

  var visit = require('unist-util-visit')
  var has = require('hast-util-has-property')

  module.exports = sort

  function sort() {
    return transform
  }

  function transform(tree) {
    visit(tree, 'element', reorder)

    function reorder(node) {
      var props = node.properties
      var index = -1
      var result = {}
      var prop

      var all = Object.keys(props).sort((left, right) => left.localeCompare(right))

      while (++index < all.length) {
        prop = all[index]

        if (has(node, prop)) {
          result[prop] = props[prop]
        }
      }

      node.properties = result
    }
  }

  },{"hast-util-has-property":53,"unist-util-visit":103}],28:[function(require,module,exports){
  'use strict'

  const VFile = require('vfile')
  const unified = require('unified')
  const parse = require('@starptech/rehype-webparser')
  const stringify = require('@starptech/prettyhtml-formatter/stringify')
  const format = require('@starptech/prettyhtml-formatter')
  const sortAttributes = require('@starptech/prettyhtml-sort-attributes')

  module.exports = prettyhtml

  function core(value, processor, options) {
    const file = new VFile(value)
    let proc = processor().use(format, {
      tabWidth: options.tabWidth,
      useTabs: options.useTabs,
      usePrettier: options.usePrettier,
      prettier: options.prettier
    })

    if (options.sortAttributes) {
      proc = proc.use(sortAttributes)
    }

    return proc
      .use(stringify, {
        wrapAttributes: options.wrapAttributes,
        printWidth: options.printWidth,
        tabWidth: options.tabWidth,
        useTabs: options.useTabs,
        singleQuote: options.singleQuote,
        closeSelfClosing: true,
        closeEmptyElements: true
      })
      .processSync(file)
  }

  function prettyhtml(value, options) {
    const opt = Object.assign({}, options)
    return core(
      value,
      unified()
        .use(parse, {
          ignoreFirstLf: false,
          decodeEntities: false,
          selfClosingCustomElements: true,
          selfClosingElements: true
        })
        .freeze(),
      opt
    )
  }

  },{"@starptech/prettyhtml-formatter":3,"@starptech/prettyhtml-formatter/stringify":4,"@starptech/prettyhtml-sort-attributes":27,"@starptech/rehype-webparser":31,"unified":95,"vfile":106}],29:[function(require,module,exports){
  /**
   * @fileoverview
   *   Collapse whitespace.
   *
   *   Normally, collapses to a single space.  If `newlines: true`,
   *   collapses white-space containing newlines to `'\n'` instead
   *   of `' '`.
   * @example
   *   <h1>Heading</h1>
   *   <p><strong>This</strong> and <em>that</em></p>
   */

  'use strict'

  var collapseWhiteSpace = require('collapse-white-space')
  var whitespaceSensitive = require('html-whitespace-sensitive-tag-names')
  var is = require('unist-util-is')
  var modify = require('unist-util-modify-children')
  var element = require('hast-util-is-element')
  var has = require('hast-util-has-property')
  var embedded = require('hast-util-embedded')
  var bodyOK = require('hast-util-is-body-ok-link')
  var list = require('./list')

  module.exports = collapse

  function collapse(options) {
    return transform
    function transform(tree) {
      return minify(tree, options || {})
    }
  }

  function minify(tree, options) {
    var whitespace = options.newlines ? collapseToNewLines : collapseWhiteSpace
    var modifier = modify(visitor)
    var inside = false
    var seen = false

    visitor(tree)

    return tree

    function visitor(node, index, parent) {
      var head
      var prev
      var next
      var value
      var start
      var end

      // don't collpase when ignore or preserve-whitespace flag was set
      if (node.data && (node.data.ignore || node.data.preserveWhitespace)) {
        return
      }

      if (is('text', node)) {
        prev = parent.children[index - 1]
        next = parent.children[index + 1]

        value = whitespace(node.value)
        end = value.length
        start = 0

        if (empty(value.charAt(0)) && viable(prev)) {
          start++
        }

        if (empty(value.charAt(end - 1)) && viable(next)) {
          end--
        }

        value = value.slice(start, end)

        /* Remove the node if it’s collapsed entirely. */
        if (!value) {
          parent.children.splice(index, 1)

          return index
        }

        node.value = value
      }

      if (!seen && !inside) {
        head = element(node, 'head')
        inside = head
        seen = head
      }

      if (node.children && !element(node, whitespaceSensitive)) {
        modifier(node)
      }

      if (head) {
        inside = false
      }
    }

    function viable(node) {
      return !node || inside || !collapsable(node)
    }
  }

  /* Check if `node` is collapsable. */
  function collapsable(node) {
    return (
      is('text', node) ||
      element(node, list) ||
      embedded(node) ||
      bodyOK(node) ||
      (element(node, 'meta') && has(node, 'itemProp'))
    )
  }

  /* Collapse to spaces, or newlines if they’re in a run. */
  function collapseToNewLines(value) {
    var result = String(value).replace(/\s+/g, function($0) {
      return $0.indexOf('\n') === -1 ? ' ' : '\n'
    })

    return result
  }

  function empty(character) {
    return character === ' ' || character === '\n'
  }

  },{"./list":30,"collapse-white-space":49,"hast-util-embedded":52,"hast-util-has-property":53,"hast-util-is-body-ok-link":54,"hast-util-is-element":55,"html-whitespace-sensitive-tag-names":60,"unist-util-is":99,"unist-util-modify-children":100}],30:[function(require,module,exports){
  module.exports = [
    'a',
    'abbr',
    'acronym',
    'b',
    'basefont',
    'big',
    'bdi',
    'bdo',
    'blink',
    'button',
    'cite',
    'code',
    'data',
    'del',
    'dfn',
    'em',
    'font',
    'i',
    'input',
    'ins',
    'kbd',
    'keygen',
    'label',
    'mark',
    'marquee',
    'meter',
    'nobr',
    'output',
    'progress',
    'q',
    'ruby',
    's',
    'samp',
    'select',
    'small',
    'spacer',
    'span',
    'strong',
    'sub',
    'sup',
    'textarea',
    'time',
    'tt',
    'u',
    'var',
    // vue
    'template',
    // angular
    'ng-container',
    'ng-template'
  ]

  },{}],31:[function(require,module,exports){
  "use strict";
  var __importDefault = (this && this.__importDefault) || function (mod) {
      return (mod && mod.__esModule) ? mod : { "default": mod };
  };
  const webparser_1 = require("@starptech/webparser");
  const hast_util_from_webparser_1 = __importDefault(require("@starptech/hast-util-from-webparser"));
  module.exports = function parse(options = {}) {
      this.Parser = parser;
      function parser(doc, file) {
          const parseResult = new webparser_1.HtmlParser(options).parse(doc, file.path);
          const lexerErrors = parseResult.errors.filter(e => !(e instanceof webparser_1.TreeError));
          const parserErrors = parseResult.errors.filter(e => e instanceof webparser_1.TreeError);
          const parserWarnings = parserErrors.filter(e => e.level === webparser_1.ParseErrorLevel.WARNING);
          for (const err of parserWarnings) {
              file.message(err.msg, {
                  start: {
                      // webparser format counts lines beginning from zero
                      line: ++err.span.start.line,
                      offset: err.span.start.offset,
                      column: err.span.start.col
                  },
                  end: {
                      line: ++err.span.end.line,
                      offset: err.span.end.offset,
                      column: err.span.end.col
                  }
              }, 'ParseError');
          }
          // log the first error which is related to the parser not lexer
          const parserFatalErrors = parserErrors.filter(e => e.level === webparser_1.ParseErrorLevel.ERROR);
          for (const err of parserFatalErrors) {
              file.fail(err.msg, {
                  start: {
                      // webparser format counts lines beginning from zero
                      line: ++err.span.start.line,
                      offset: err.span.start.offset,
                      column: err.span.start.col
                  },
                  end: {
                      line: ++err.span.end.line,
                      offset: err.span.end.offset,
                      column: err.span.end.col
                  }
              }, 'ParseError');
          }
          // when lexer error don't produce a parser error we still need to fail with the lexer error
          if (parserFatalErrors.length === 0 && lexerErrors.length > 0) {
              const err = lexerErrors[0];
              file.fail(err.msg, {
                  start: {
                      // webparser format counts lines beginning from zero
                      line: ++err.span.start.line,
                      offset: err.span.start.offset,
                      column: err.span.start.col
                  },
                  end: {
                      line: ++err.span.end.line,
                      offset: err.span.end.offset,
                      column: err.span.end.col
                  }
              }, 'LexerError');
          }
          return hast_util_from_webparser_1.default(parseResult.rootNodes, options);
      }
  };

  },{"@starptech/hast-util-from-webparser":2,"@starptech/webparser":42}],32:[function(require,module,exports){
  "use strict";
  Object.defineProperty(exports, "__esModule", { value: true });
  function assertArrayOfStrings(identifier, value) {
      if (value == null) {
          return;
      }
      if (!Array.isArray(value)) {
          throw new Error(`Expected '${identifier}' to be an array of strings.`);
      }
      for (let i = 0; i < value.length; i += 1) {
          if (typeof value[i] !== 'string') {
              throw new Error(`Expected '${identifier}' to be an array of strings.`);
          }
      }
  }
  exports.assertArrayOfStrings = assertArrayOfStrings;
  const INTERPOLATION_BLACKLIST_REGEXPS = [
      /^\s*$/,
      /[<>]/,
      /^[{}]$/,
      /&(#|[a-z])/i,
      /^\/\// // comment
  ];
  function assertInterpolationSymbols(identifier, value) {
      if (value != null && !(Array.isArray(value) && value.length == 2)) {
          throw new Error(`Expected '${identifier}' to be an array, [start, end].`);
      }
      else if (value != null) {
          const start = value[0];
          const end = value[1];
          // black list checking
          INTERPOLATION_BLACKLIST_REGEXPS.forEach(regexp => {
              if (regexp.test(start) || regexp.test(end)) {
                  throw new Error(`['${start}', '${end}'] contains unusable interpolation symbol.`);
              }
          });
      }
  }
  exports.assertInterpolationSymbols = assertInterpolationSymbols;

  },{}],33:[function(require,module,exports){
  "use strict";
  Object.defineProperty(exports, "__esModule", { value: true });
  const ast_path_1 = require("./ast_path");
  class Text {
      constructor(value, sourceSpan) {
          this.value = value;
          this.sourceSpan = sourceSpan;
      }
      visit(visitor, context) {
          return visitor.visitText(this, context);
      }
  }
  exports.Text = Text;
  class Attribute {
      constructor(name, value, implicitNs, sourceSpan, valueSpan) {
          this.name = name;
          this.value = value;
          this.implicitNs = implicitNs;
          this.sourceSpan = sourceSpan;
          this.valueSpan = valueSpan;
      }
      visit(visitor, context) {
          return visitor.visitAttribute(this, context);
      }
  }
  exports.Attribute = Attribute;
  class Element {
      constructor(name, attrs, children, implicitNs, sourceSpan, startSourceSpan = null, endSourceSpan = null) {
          this.name = name;
          this.attrs = attrs;
          this.children = children;
          this.implicitNs = implicitNs;
          this.sourceSpan = sourceSpan;
          this.startSourceSpan = startSourceSpan;
          this.endSourceSpan = endSourceSpan;
      }
      visit(visitor, context) {
          return visitor.visitElement(this, context);
      }
  }
  exports.Element = Element;
  class Comment {
      constructor(value, sourceSpan) {
          this.value = value;
          this.sourceSpan = sourceSpan;
      }
      visit(visitor, context) {
          return visitor.visitComment(this, context);
      }
  }
  exports.Comment = Comment;
  class Doctype {
      constructor(value, sourceSpan) {
          this.value = value;
          this.sourceSpan = sourceSpan;
      }
      visit(visitor, context) {
          return visitor.visitDoctype(this, context);
      }
  }
  exports.Doctype = Doctype;
  function visitAll(visitor, nodes, context = null) {
      const result = [];
      const visit = visitor.visit
          ? (ast) => visitor.visit(ast, context) || ast.visit(visitor, context)
          : (ast) => ast.visit(visitor, context);
      nodes.forEach(ast => {
          const astResult = visit(ast);
          if (astResult) {
              result.push(astResult);
          }
      });
      return result;
  }
  exports.visitAll = visitAll;
  class RecursiveVisitor {
      constructor() { }
      visitElement(ast, context) {
          this.visitChildren(context, visit => {
              visit(ast.attrs);
              visit(ast.children);
          });
      }
      visitAttribute(ast, context) { }
      visitText(ast, context) { }
      visitComment(ast, context) { }
      visitDoctype(doctype, context) { }
      visitChildren(context, cb) {
          let results = [];
          let t = this;
          function visit(children) {
              if (children)
                  results.push(visitAll(t, children, context));
          }
          cb(visit);
          return [].concat.apply([], results);
      }
  }
  exports.RecursiveVisitor = RecursiveVisitor;
  function spanOf(ast) {
      const start = ast.sourceSpan.start.offset;
      let end = ast.sourceSpan.end.offset;
      if (ast instanceof Element) {
          if (ast.endSourceSpan) {
              end = ast.endSourceSpan.end.offset;
          }
          else if (ast.children && ast.children.length) {
              end = spanOf(ast.children[ast.children.length - 1]).end;
          }
      }
      return { start, end };
  }
  function findNode(nodes, position) {
      const path = [];
      const visitor = new class extends RecursiveVisitor {
          visit(ast, context) {
              const span = spanOf(ast);
              if (span.start <= position && position < span.end) {
                  path.push(ast);
              }
              else {
                  // Returning a value here will result in the children being skipped.
                  return true;
              }
          }
      }();
      visitAll(visitor, nodes);
      return new ast_path_1.AstPath(path, position);
  }
  exports.findNode = findNode;

  },{"./ast_path":34}],34:[function(require,module,exports){
  "use strict";
  Object.defineProperty(exports, "__esModule", { value: true });
  /**
   * A path is an ordered set of elements. Typically a path is to  a
   * particular offset in a source file. The head of the list is the top
   * most node. The tail is the node that contains the offset directly.
   *
   * For example, the expression `a + b + c` might have an ast that looks
   * like:
   *     +
   *    / \
   *   a   +
   *      / \
   *     b   c
   *
   * The path to the node at offset 9 would be `['+' at 1-10, '+' at 7-10,
   * 'c' at 9-10]` and the path the node at offset 1 would be
   * `['+' at 1-10, 'a' at 1-2]`.
   */
  class AstPath {
      constructor(path, position = -1) {
          this.path = path;
          this.position = position;
      }
      get empty() {
          return !this.path || !this.path.length;
      }
      get head() {
          return this.path[0];
      }
      get tail() {
          return this.path[this.path.length - 1];
      }
      parentOf(node) {
          return node && this.path[this.path.indexOf(node) - 1];
      }
      childOf(node) {
          return this.path[this.path.indexOf(node) + 1];
      }
      first(ctor) {
          for (let i = this.path.length - 1; i >= 0; i--) {
              let item = this.path[i];
              if (item instanceof ctor)
                  return item;
          }
      }
      push(node) {
          this.path.push(node);
      }
      pop() {
          return this.path.pop();
      }
  }
  exports.AstPath = AstPath;

  },{}],35:[function(require,module,exports){
  "use strict";
  Object.defineProperty(exports, "__esModule", { value: true });
  exports.$EOF = 0;
  exports.$TAB = 9;
  exports.$LF = 10;
  exports.$VTAB = 11;
  exports.$FF = 12;
  exports.$CR = 13;
  exports.$SPACE = 32;
  exports.$BANG = 33;
  exports.$DQ = 34;
  exports.$HASH = 35;
  exports.$$ = 36;
  exports.$PERCENT = 37;
  exports.$AMPERSAND = 38;
  exports.$SQ = 39;
  exports.$LPAREN = 40;
  exports.$RPAREN = 41;
  exports.$STAR = 42;
  exports.$PLUS = 43;
  exports.$COMMA = 44;
  exports.$MINUS = 45;
  exports.$PERIOD = 46;
  exports.$SLASH = 47;
  exports.$COLON = 58;
  exports.$SEMICOLON = 59;
  exports.$LT = 60;
  exports.$EQ = 61;
  exports.$GT = 62;
  exports.$QUESTION = 63;
  exports.$0 = 48;
  exports.$9 = 57;
  exports.$A = 65;
  exports.$E = 69;
  exports.$F = 70;
  exports.$X = 88;
  exports.$Z = 90;
  exports.$LBRACKET = 91;
  exports.$BACKSLASH = 92;
  exports.$RBRACKET = 93;
  exports.$CARET = 94;
  exports.$_ = 95;
  exports.$a = 97;
  exports.$e = 101;
  exports.$f = 102;
  exports.$n = 110;
  exports.$r = 114;
  exports.$t = 116;
  exports.$u = 117;
  exports.$v = 118;
  exports.$x = 120;
  exports.$z = 122;
  exports.$LBRACE = 123;
  exports.$BAR = 124;
  exports.$RBRACE = 125;
  exports.$NBSP = 160;
  exports.$PIPE = 124;
  exports.$TILDA = 126;
  exports.$AT = 64;
  exports.$BT = 96;
  function isWhitespace(code) {
      return (code >= exports.$TAB && code <= exports.$SPACE) || code == exports.$NBSP;
  }
  exports.isWhitespace = isWhitespace;
  function isDigit(code) {
      return exports.$0 <= code && code <= exports.$9;
  }
  exports.isDigit = isDigit;
  function isAsciiLetter(code) {
      return (code >= exports.$a && code <= exports.$z) || (code >= exports.$A && code <= exports.$Z);
  }
  exports.isAsciiLetter = isAsciiLetter;
  function isAsciiHexDigit(code) {
      return (code >= exports.$a && code <= exports.$f) || (code >= exports.$A && code <= exports.$F) || isDigit(code);
  }
  exports.isAsciiHexDigit = isAsciiHexDigit;

  },{}],36:[function(require,module,exports){
  "use strict";
  Object.defineProperty(exports, "__esModule", { value: true });
  const html_tags_1 = require("./html_tags");
  const interpolation_config_1 = require("./interpolation_config");
  const parser_1 = require("./parser");
  var parser_2 = require("./parser");
  exports.ParseTreeResult = parser_2.ParseTreeResult;
  exports.TreeError = parser_2.TreeError;
  class HtmlParser extends parser_1.Parser {
      constructor(options = {
          decodeEntities: true,
          ignoreFirstLf: true,
          insertRequiredParents: false,
          selfClosingElements: false,
          selfClosingCustomElements: false
      }) {
          super(options, html_tags_1.getHtmlTagDefinition);
          this.options = options;
      }
      parse(source, url, interpolationConfig = interpolation_config_1.DEFAULT_INTERPOLATION_CONFIG) {
          return super.parse(source, url, interpolationConfig);
      }
  }
  exports.HtmlParser = HtmlParser;

  },{"./html_tags":37,"./interpolation_config":38,"./parser":41}],37:[function(require,module,exports){
  "use strict";
  Object.defineProperty(exports, "__esModule", { value: true });
  const tags_1 = require("./tags");
  class HtmlTagDefinition {
      constructor({ closedByChildren, requiredParents, implicitNamespacePrefix, contentType = tags_1.TagContentType.PARSABLE_DATA, closedByParent = false, isVoid = false, ignoreFirstLf = false, canSelfClose = false } = {}) {
          this.closedByChildren = {};
          this.closedByParent = false;
          if (closedByChildren && closedByChildren.length > 0) {
              closedByChildren.forEach(tagName => (this.closedByChildren[tagName] = true));
          }
          this.isVoid = isVoid;
          this.canSelfClose = canSelfClose;
          this.closedByParent = closedByParent || isVoid;
          if (requiredParents && requiredParents.length > 0) {
              this.requiredParents = {};
              // The first parent is the list is automatically when none of the listed parents are present
              this.parentToAdd = requiredParents[0];
              requiredParents.forEach(tagName => (this.requiredParents[tagName] = true));
          }
          this.implicitNamespacePrefix = implicitNamespacePrefix || null;
          this.contentType = contentType;
          this.ignoreFirstLf = ignoreFirstLf;
      }
      requireExtraParent(currentParent) {
          if (!this.requiredParents) {
              return false;
          }
          if (!currentParent) {
              return true;
          }
          const lcParent = currentParent.toLowerCase();
          const isParentTemplate = lcParent === 'template' || currentParent === 'ng-template';
          return !isParentTemplate && this.requiredParents[lcParent] != true;
      }
      isClosedByChild(name) {
          return this.isVoid || name.toLowerCase() in this.closedByChildren;
      }
  }
  exports.HtmlTagDefinition = HtmlTagDefinition;
  // see http://www.w3.org/TR/html51/syntax.html#optional-tags
  // This implementation isn't fully conform to the HTML5 spec.
  let TAG_DEFINITIONS = new Map();
  function getHtmlTagDefinition(tagName, ignoreFirstLf, canSelfClose) {
      const cacheKey = `${ignoreFirstLf},${canSelfClose}`;
      // we store different views of the tag definition that's why we need a cache invalidation strategy
      if (!TAG_DEFINITIONS.has(cacheKey)) {
          TAG_DEFINITIONS.set(cacheKey, {
              base: new HtmlTagDefinition({ isVoid: true, canSelfClose }),
              meta: new HtmlTagDefinition({ isVoid: true, canSelfClose }),
              area: new HtmlTagDefinition({ isVoid: true, canSelfClose }),
              embed: new HtmlTagDefinition({ isVoid: true, canSelfClose }),
              link: new HtmlTagDefinition({ isVoid: true, canSelfClose }),
              img: new HtmlTagDefinition({ isVoid: true, canSelfClose }),
              image: new HtmlTagDefinition({ isVoid: true, canSelfClose }),
              input: new HtmlTagDefinition({ isVoid: true, canSelfClose }),
              param: new HtmlTagDefinition({ isVoid: true, canSelfClose }),
              hr: new HtmlTagDefinition({ isVoid: true, canSelfClose }),
              br: new HtmlTagDefinition({ isVoid: true, canSelfClose }),
              source: new HtmlTagDefinition({ isVoid: true, canSelfClose }),
              track: new HtmlTagDefinition({ isVoid: true, canSelfClose }),
              wbr: new HtmlTagDefinition({ isVoid: true, canSelfClose }),
              p: new HtmlTagDefinition({
                  closedByChildren: [
                      'address',
                      'article',
                      'aside',
                      'blockquote',
                      'div',
                      'dl',
                      'fieldset',
                      'footer',
                      'form',
                      'h1',
                      'h2',
                      'h3',
                      'h4',
                      'h5',
                      'h6',
                      'header',
                      'hgroup',
                      'hr',
                      'main',
                      'nav',
                      'ol',
                      'p',
                      'pre',
                      'section',
                      'table',
                      'ul'
                  ],
                  closedByParent: true,
                  canSelfClose
              }),
              thead: new HtmlTagDefinition({
                  closedByChildren: ['tbody', 'tfoot'],
                  canSelfClose
              }),
              tbody: new HtmlTagDefinition({
                  closedByChildren: ['tbody', 'tfoot'],
                  closedByParent: true,
                  canSelfClose
              }),
              tfoot: new HtmlTagDefinition({
                  closedByChildren: ['tbody'],
                  closedByParent: true,
                  canSelfClose
              }),
              tr: new HtmlTagDefinition({
                  closedByChildren: ['tr'],
                  requiredParents: ['tbody', 'tfoot', 'thead'],
                  closedByParent: true,
                  canSelfClose
              }),
              td: new HtmlTagDefinition({
                  closedByChildren: ['td', 'th'],
                  closedByParent: true,
                  canSelfClose
              }),
              th: new HtmlTagDefinition({
                  closedByChildren: ['td', 'th'],
                  closedByParent: true,
                  canSelfClose
              }),
              col: new HtmlTagDefinition({
                  requiredParents: ['colgroup'],
                  isVoid: true,
                  canSelfClose
              }),
              svg: new HtmlTagDefinition({
                  implicitNamespacePrefix: 'svg',
                  canSelfClose
              }),
              math: new HtmlTagDefinition({
                  implicitNamespacePrefix: 'math',
                  canSelfClose
              }),
              li: new HtmlTagDefinition({
                  closedByChildren: ['li'],
                  closedByParent: true,
                  canSelfClose
              }),
              dt: new HtmlTagDefinition({
                  closedByChildren: ['dt', 'dd'],
                  canSelfClose
              }),
              dd: new HtmlTagDefinition({
                  closedByChildren: ['dt', 'dd'],
                  closedByParent: true,
                  canSelfClose
              }),
              rb: new HtmlTagDefinition({
                  closedByChildren: ['rb', 'rt', 'rtc', 'rp'],
                  closedByParent: true,
                  canSelfClose
              }),
              rt: new HtmlTagDefinition({
                  closedByChildren: ['rb', 'rt', 'rtc', 'rp'],
                  closedByParent: true,
                  canSelfClose
              }),
              rtc: new HtmlTagDefinition({
                  closedByChildren: ['rb', 'rtc', 'rp'],
                  closedByParent: true,
                  canSelfClose
              }),
              rp: new HtmlTagDefinition({
                  closedByChildren: ['rb', 'rt', 'rtc', 'rp'],
                  closedByParent: true,
                  canSelfClose
              }),
              optgroup: new HtmlTagDefinition({
                  closedByChildren: ['optgroup'],
                  closedByParent: true,
                  canSelfClose
              }),
              option: new HtmlTagDefinition({
                  closedByChildren: ['option', 'optgroup'],
                  closedByParent: true,
                  canSelfClose
              }),
              pre: new HtmlTagDefinition({ ignoreFirstLf, canSelfClose }),
              listing: new HtmlTagDefinition({ ignoreFirstLf, canSelfClose }),
              style: new HtmlTagDefinition({
                  contentType: tags_1.TagContentType.RAW_TEXT,
                  canSelfClose
              }),
              script: new HtmlTagDefinition({
                  contentType: tags_1.TagContentType.RAW_TEXT,
                  canSelfClose
              }),
              title: new HtmlTagDefinition({
                  contentType: tags_1.TagContentType.ESCAPABLE_RAW_TEXT,
                  canSelfClose
              }),
              textarea: new HtmlTagDefinition({
                  contentType: tags_1.TagContentType.ESCAPABLE_RAW_TEXT,
                  ignoreFirstLf,
                  canSelfClose
              })
          });
      }
      return TAG_DEFINITIONS.get(cacheKey)[tagName] || new HtmlTagDefinition({ canSelfClose });
  }
  exports.getHtmlTagDefinition = getHtmlTagDefinition;
  function isKnownHTMLTag(tagName) {
      return tagName.toUpperCase() in TAG_DICTIONARY;
  }
  exports.isKnownHTMLTag = isKnownHTMLTag;
  const TAG_DICTIONARY = {
      A: 'a',
      ADDRESS: 'address',
      ANNOTATION_XML: 'annotation-xml',
      APPLET: 'applet',
      AREA: 'area',
      ARTICLE: 'article',
      ASIDE: 'aside',
      B: 'b',
      BASE: 'base',
      BASEFONT: 'basefont',
      BGSOUND: 'bgsound',
      BIG: 'big',
      BLOCKQUOTE: 'blockquote',
      BODY: 'body',
      BR: 'br',
      BUTTON: 'button',
      CAPTION: 'caption',
      CENTER: 'center',
      CODE: 'code',
      COL: 'col',
      COLGROUP: 'colgroup',
      DD: 'dd',
      DESC: 'desc',
      DETAILS: 'details',
      DIALOG: 'dialog',
      DIR: 'dir',
      DIV: 'div',
      DL: 'dl',
      DT: 'dt',
      EM: 'em',
      EMBED: 'embed',
      FIELDSET: 'fieldset',
      FIGCAPTION: 'figcaption',
      FIGURE: 'figure',
      FONT: 'font',
      FOOTER: 'footer',
      FOREIGN_OBJECT: 'foreignObject',
      FORM: 'form',
      FRAME: 'frame',
      FRAMESET: 'frameset',
      H1: 'h1',
      H2: 'h2',
      H3: 'h3',
      H4: 'h4',
      H5: 'h5',
      H6: 'h6',
      HEAD: 'head',
      HEADER: 'header',
      HGROUP: 'hgroup',
      HR: 'hr',
      HTML: 'html',
      I: 'i',
      IMG: 'img',
      IMAGE: 'image',
      INPUT: 'input',
      IFRAME: 'iframe',
      KEYGEN: 'keygen',
      LABEL: 'label',
      LI: 'li',
      LINK: 'link',
      LISTING: 'listing',
      MAIN: 'main',
      MALIGNMARK: 'malignmark',
      MARQUEE: 'marquee',
      MATH: 'math',
      MENU: 'menu',
      META: 'meta',
      MGLYPH: 'mglyph',
      MI: 'mi',
      MO: 'mo',
      MN: 'mn',
      MS: 'ms',
      MTEXT: 'mtext',
      NAV: 'nav',
      NOBR: 'nobr',
      NOFRAMES: 'noframes',
      NOEMBED: 'noembed',
      NOSCRIPT: 'noscript',
      OBJECT: 'object',
      OL: 'ol',
      OPTGROUP: 'optgroup',
      OPTION: 'option',
      P: 'p',
      PARAM: 'param',
      PLAINTEXT: 'plaintext',
      PRE: 'pre',
      RB: 'rb',
      RP: 'rp',
      RT: 'rt',
      RTC: 'rtc',
      RUBY: 'ruby',
      S: 's',
      SCRIPT: 'script',
      SECTION: 'section',
      SELECT: 'select',
      SOURCE: 'source',
      SMALL: 'small',
      SPAN: 'span',
      STRIKE: 'strike',
      STRONG: 'strong',
      STYLE: 'style',
      SUB: 'sub',
      SUMMARY: 'summary',
      SUP: 'sup',
      TABLE: 'table',
      TBODY: 'tbody',
      TEMPLATE: 'template',
      TEXTAREA: 'textarea',
      TFOOT: 'tfoot',
      TD: 'td',
      TH: 'th',
      THEAD: 'thead',
      TITLE: 'title',
      TR: 'tr',
      TRACK: 'track',
      TT: 'tt',
      U: 'u',
      UL: 'ul',
      SVG: 'svg',
      VAR: 'var',
      WBR: 'wbr',
      XMP: 'xmp'
  };

  },{"./tags":43}],38:[function(require,module,exports){
  "use strict";
  Object.defineProperty(exports, "__esModule", { value: true });
  const assertions_1 = require("./assertions");
  class InterpolationConfig {
      constructor(start, end) {
          this.start = start;
          this.end = end;
      }
      static fromArray(markers) {
          if (!markers) {
              return exports.DEFAULT_INTERPOLATION_CONFIG;
          }
          assertions_1.assertInterpolationSymbols('interpolation', markers);
          return new InterpolationConfig(markers[0], markers[1]);
      }
  }
  exports.InterpolationConfig = InterpolationConfig;
  exports.DEFAULT_INTERPOLATION_CONFIG = new InterpolationConfig('{{', '}}');

  },{"./assertions":32}],39:[function(require,module,exports){
  "use strict";
  var __importStar = (this && this.__importStar) || function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
      result["default"] = mod;
      return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  const chars = __importStar(require("./chars"));
  const parse_util_1 = require("./parse_util");
  const interpolation_config_1 = require("./interpolation_config");
  const tags_1 = require("./tags");
  var TokenType;
  (function (TokenType) {
      TokenType[TokenType["TAG_OPEN_START"] = 0] = "TAG_OPEN_START";
      TokenType[TokenType["TAG_OPEN_END"] = 1] = "TAG_OPEN_END";
      TokenType[TokenType["TAG_OPEN_END_VOID"] = 2] = "TAG_OPEN_END_VOID";
      TokenType[TokenType["TAG_CLOSE"] = 3] = "TAG_CLOSE";
      TokenType[TokenType["TEXT"] = 4] = "TEXT";
      TokenType[TokenType["ESCAPABLE_RAW_TEXT"] = 5] = "ESCAPABLE_RAW_TEXT";
      TokenType[TokenType["RAW_TEXT"] = 6] = "RAW_TEXT";
      TokenType[TokenType["COMMENT_START"] = 7] = "COMMENT_START";
      TokenType[TokenType["COMMENT_END"] = 8] = "COMMENT_END";
      TokenType[TokenType["CDATA_START"] = 9] = "CDATA_START";
      TokenType[TokenType["CDATA_END"] = 10] = "CDATA_END";
      TokenType[TokenType["ATTR_NAME"] = 11] = "ATTR_NAME";
      TokenType[TokenType["ATTR_VALUE"] = 12] = "ATTR_VALUE";
      TokenType[TokenType["DOC_TYPE"] = 13] = "DOC_TYPE";
      TokenType[TokenType["EOF"] = 14] = "EOF";
  })(TokenType = exports.TokenType || (exports.TokenType = {}));
  class Token {
      constructor(type, parts, sourceSpan) {
          this.type = type;
          this.parts = parts;
          this.sourceSpan = sourceSpan;
      }
  }
  exports.Token = Token;
  class TokenError extends parse_util_1.ParseError {
      constructor(errorMsg, tokenType, span) {
          super(span, errorMsg);
          this.tokenType = tokenType;
      }
  }
  exports.TokenError = TokenError;
  class TokenizeResult {
      constructor(tokens, errors) {
          this.tokens = tokens;
          this.errors = errors;
      }
  }
  exports.TokenizeResult = TokenizeResult;
  function tokenize(source, url, getTagDefinition, interpolationConfig = interpolation_config_1.DEFAULT_INTERPOLATION_CONFIG, options = {
      decodeEntities: true,
      ignoreFirstLf: true,
      selfClosingElements: false
  }) {
      return new _Tokenizer(new parse_util_1.ParseSourceFile(source, url), getTagDefinition, interpolationConfig, options).tokenize();
  }
  exports.tokenize = tokenize;
  const _CR_OR_CRLF_REGEXP = /\r\n?/g;
  function _unexpectedCharacterErrorMsg(charCode) {
      const char = charCode === chars.$EOF ? 'EOF' : String.fromCharCode(charCode);
      return `Unexpected character "${char}"`;
  }
  function _unknownEntityErrorMsg(entitySrc) {
      return `Unknown entity "${entitySrc}" - use the "&#<decimal>;" or  "&#x<hex>;" syntax`;
  }
  class _ControlFlowError {
      constructor(error) {
          this.error = error;
      }
  }
  // See http://www.w3.org/TR/html51/syntax.html#writing
  class _Tokenizer {
      /**
       * @param _file The html source
       * @param _getTagDefinition
       * @param _interpolationConfig
       */
      constructor(_file, _getTagDefinition, _interpolationConfig = interpolation_config_1.DEFAULT_INTERPOLATION_CONFIG, _options) {
          this._file = _file;
          this._getTagDefinition = _getTagDefinition;
          this._interpolationConfig = _interpolationConfig;
          this._options = _options;
          // Note: this is always lowercase!
          this._peek = -1;
          this._nextPeek = -1;
          this._index = -1;
          this._line = 0;
          this._column = -1;
          this._inInterpolation = false;
          this.tokens = [];
          this.errors = [];
          this._input = _file.content;
          this._length = _file.content.length;
          this._advance();
      }
      _processCarriageReturns(content) {
          // http://www.w3.org/TR/html5/syntax.html#preprocessing-the-input-stream
          // In order to keep the original position in the source, we can not
          // pre-process it.
          // Instead CRs are processed right before instantiating the tokens.
          return content.replace(_CR_OR_CRLF_REGEXP, '\n');
      }
      tokenize() {
          while (this._peek !== chars.$EOF) {
              const start = this._getLocation();
              try {
                  if (this._attemptCharCode(chars.$LT)) {
                      if (this._attemptCharCode(chars.$BANG)) {
                          if (this._attemptCharCode(chars.$LBRACKET)) {
                              this._consumeCdata(start);
                          }
                          else if (this._attemptCharCode(chars.$MINUS)) {
                              this._consumeComment(start);
                          }
                          else {
                              this._consumeDocType(start);
                          }
                      }
                      else if (this._attemptCharCode(chars.$SLASH)) {
                          this._consumeTagClose(start);
                      }
                      else {
                          this._consumeTagOpen(start);
                      }
                  }
                  else {
                      this._consumeText();
                  }
              }
              catch (e) {
                  if (e instanceof _ControlFlowError) {
                      this.errors.push(e.error);
                  }
                  else {
                      throw e;
                  }
              }
          }
          this._beginToken(TokenType.EOF);
          this._endToken([]);
          return new TokenizeResult(mergeTextTokens(this.tokens), this.errors);
      }
      _getLocation() {
          return new parse_util_1.ParseLocation(this._file, this._index, this._line, this._column);
      }
      _getSpan(start = this._getLocation(), end = this._getLocation()) {
          return new parse_util_1.ParseSourceSpan(start, end);
      }
      _beginToken(type, start = this._getLocation()) {
          this._currentTokenStart = start;
          this._currentTokenType = type;
      }
      _endToken(parts, end = this._getLocation()) {
          const token = new Token(this._currentTokenType, parts, new parse_util_1.ParseSourceSpan(this._currentTokenStart, end));
          this.tokens.push(token);
          this._currentTokenStart = null;
          this._currentTokenType = null;
          return token;
      }
      _createError(msg, span) {
          const error = new TokenError(msg, this._currentTokenType, span);
          this._currentTokenStart = null;
          this._currentTokenType = null;
          return new _ControlFlowError(error);
      }
      _advance() {
          if (this._index >= this._length) {
              throw this._createError(_unexpectedCharacterErrorMsg(chars.$EOF), this._getSpan());
          }
          if (this._peek === chars.$LF) {
              this._line++;
              this._column = 0;
          }
          else if (this._peek !== chars.$LF && this._peek !== chars.$CR) {
              this._column++;
          }
          this._index++;
          this._peek = this._index >= this._length ? chars.$EOF : this._input.charCodeAt(this._index);
          this._nextPeek = this._index + 1 >= this._length ? chars.$EOF : this._input.charCodeAt(this._index + 1);
      }
      _attemptCharCode(charCode) {
          if (this._peek === charCode) {
              this._advance();
              return true;
          }
          return false;
      }
      _attemptCharCodeCaseInsensitive(charCode) {
          if (compareCharCodeCaseInsensitive(this._peek, charCode)) {
              this._advance();
              return true;
          }
          return false;
      }
      _requireCharCode(charCode) {
          const location = this._getLocation();
          if (!this._attemptCharCode(charCode)) {
              throw this._createError(_unexpectedCharacterErrorMsg(this._peek), this._getSpan(location, location));
          }
      }
      _attemptStr(chars) {
          const len = chars.length;
          if (this._index + len > this._length) {
              return false;
          }
          const initialPosition = this._savePosition();
          for (let i = 0; i < len; i++) {
              if (!this._attemptCharCode(chars.charCodeAt(i))) {
                  // If attempting to parse the string fails, we want to reset the parser
                  // to where it was before the attempt
                  this._restorePosition(initialPosition);
                  return false;
              }
          }
          return true;
      }
      _attemptStrCaseInsensitive(chars) {
          for (let i = 0; i < chars.length; i++) {
              if (!this._attemptCharCodeCaseInsensitive(chars.charCodeAt(i))) {
                  return false;
              }
          }
          return true;
      }
      _requireStr(chars) {
          const location = this._getLocation();
          if (!this._attemptStr(chars)) {
              throw this._createError(_unexpectedCharacterErrorMsg(this._peek), this._getSpan(location));
          }
      }
      _attemptCharCodeUntilFn(predicate) {
          while (!predicate(this._peek)) {
              this._advance();
          }
      }
      _requireCharCodeUntilFn(predicate, len) {
          const start = this._getLocation();
          this._attemptCharCodeUntilFn(predicate);
          if (this._index - start.offset < len) {
              throw this._createError(_unexpectedCharacterErrorMsg(this._peek), this._getSpan(start, start));
          }
      }
      _attemptUntilChar(char) {
          while (this._peek !== char) {
              this._advance();
          }
      }
      _readChar(decodeEntities) {
          if (decodeEntities && this._peek === chars.$AMPERSAND) {
              return this._decodeEntity();
          }
          else {
              const index = this._index;
              this._advance();
              return this._input[index];
          }
      }
      _decodeEntity() {
          const start = this._getLocation();
          this._advance();
          if (this._attemptCharCode(chars.$HASH)) {
              const isHex = this._attemptCharCode(chars.$x) || this._attemptCharCode(chars.$X);
              const numberStart = this._getLocation().offset;
              this._attemptCharCodeUntilFn(isDigitEntityEnd);
              if (this._peek != chars.$SEMICOLON) {
                  throw this._createError(_unexpectedCharacterErrorMsg(this._peek), this._getSpan());
              }
              this._advance();
              const strNum = this._input.substring(numberStart, this._index - 1);
              try {
                  const charCode = parseInt(strNum, isHex ? 16 : 10);
                  return String.fromCharCode(charCode);
              }
              catch (e) {
                  const entity = this._input.substring(start.offset + 1, this._index - 1);
                  throw this._createError(_unknownEntityErrorMsg(entity), this._getSpan(start));
              }
          }
          else {
              const startPosition = this._savePosition();
              this._attemptCharCodeUntilFn(isNamedEntityEnd);
              if (this._peek != chars.$SEMICOLON) {
                  this._restorePosition(startPosition);
                  return '&';
              }
              this._advance();
              const name = this._input.substring(start.offset + 1, this._index - 1);
              const char = tags_1.NAMED_ENTITIES[name];
              if (!char) {
                  throw this._createError(_unknownEntityErrorMsg(name), this._getSpan(start));
              }
              return char;
          }
      }
      _consumeRawText(decodeEntities, firstCharOfEnd, attemptEndRest) {
          let tagCloseStart;
          const textStart = this._getLocation();
          this._beginToken(decodeEntities ? TokenType.ESCAPABLE_RAW_TEXT : TokenType.RAW_TEXT, textStart);
          const parts = [];
          while (true) {
              tagCloseStart = this._getLocation();
              if (this._attemptCharCode(firstCharOfEnd) && attemptEndRest()) {
                  break;
              }
              if (this._index > tagCloseStart.offset) {
                  // add the characters consumed by the previous if statement to the output
                  parts.push(this._input.substring(tagCloseStart.offset, this._index));
              }
              while (this._peek !== firstCharOfEnd) {
                  parts.push(this._readChar(decodeEntities));
              }
          }
          return this._endToken([this._processCarriageReturns(parts.join(''))], tagCloseStart);
      }
      _consumeComment(start) {
          this._beginToken(TokenType.COMMENT_START, start);
          this._requireCharCode(chars.$MINUS);
          this._endToken([]);
          const textToken = this._consumeRawText(false, chars.$MINUS, () => this._attemptStr('->'));
          this._beginToken(TokenType.COMMENT_END, textToken.sourceSpan.end);
          this._endToken([]);
      }
      _consumeCdata(start) {
          this._beginToken(TokenType.CDATA_START, start);
          this._requireStr('CDATA[');
          this._endToken([]);
          const textToken = this._consumeRawText(false, chars.$RBRACKET, () => this._attemptStr(']>'));
          this._beginToken(TokenType.CDATA_END, textToken.sourceSpan.end);
          this._endToken([]);
      }
      _consumeDocType(start) {
          this._beginToken(TokenType.DOC_TYPE, start);
          this._attemptUntilChar(chars.$GT);
          this._advance();
          this._endToken([this._input.substring(start.offset + 2, this._index - 1)]);
      }
      _consumePrefixAndName() {
          const nameOrPrefixStart = this._index;
          let prefix = null;
          while (this._peek !== chars.$COLON && !isPrefixEnd(this._peek)) {
              this._advance();
          }
          let nameStart;
          if (this._peek === chars.$COLON) {
              this._advance();
              prefix = this._input.substring(nameOrPrefixStart, this._index - 1);
              nameStart = this._index;
          }
          else {
              nameStart = nameOrPrefixStart;
          }
          this._requireCharCodeUntilFn(isNameEnd, this._index === nameStart ? 1 : 0);
          let name = this._input.substring(nameStart, this._index);
          // atributes can have a leading collon
          if (prefix === '') {
              name = ':' + name;
              prefix = null;
          }
          return [prefix, name];
      }
      _consumeTagOpen(start) {
          const savedPos = this._savePosition();
          let tagName;
          let lowercaseTagName;
          try {
              if (!chars.isAsciiLetter(this._peek)) {
                  throw this._createError(_unexpectedCharacterErrorMsg(this._peek), this._getSpan());
              }
              const nameStart = this._index;
              this._consumeTagOpenStart(start);
              tagName = this._input.substring(nameStart, this._index);
              lowercaseTagName = tagName.toLowerCase();
              this._attemptCharCodeUntilFn(isNotWhitespace);
              while (this._peek !== chars.$SLASH && this._peek !== chars.$GT) {
                  this._consumeAttributeName();
                  this._attemptCharCodeUntilFn(isNotWhitespace);
                  if (this._attemptCharCode(chars.$EQ)) {
                      this._attemptCharCodeUntilFn(isNotWhitespace);
                      this._consumeAttributeValue();
                  }
                  this._attemptCharCodeUntilFn(isNotWhitespace);
              }
              this._consumeTagOpenEnd();
          }
          catch (e) {
              if (e instanceof _ControlFlowError) {
                  // When the start tag is invalid, assume we want a "<"
                  this._restorePosition(savedPos);
                  // Back to back text tokens are merged at the end
                  this._beginToken(TokenType.TEXT, start);
                  this._endToken(['<']);
                  return;
              }
              throw e;
          }
          const contentTokenType = this._getTagDefinition(tagName, this._options.ignoreFirstLf, this._options.selfClosingElements).contentType;
          // allow raw text elements to self-close itself
          // check if the element was self-closed in that case we can skip parsing text and don't run into a parser error
          if (this._options.selfClosingElements &&
              this.tokens[this.tokens.length - 1].type === TokenType.TAG_OPEN_END_VOID) {
              return;
          }
          if (contentTokenType === tags_1.TagContentType.RAW_TEXT) {
              this._consumeRawTextWithTagClose(lowercaseTagName, false);
          }
          else if (contentTokenType === tags_1.TagContentType.ESCAPABLE_RAW_TEXT) {
              this._consumeRawTextWithTagClose(lowercaseTagName, true);
          }
      }
      _consumeRawTextWithTagClose(lowercaseTagName, decodeEntities) {
          const textToken = this._consumeRawText(decodeEntities, chars.$LT, () => {
              if (!this._attemptCharCode(chars.$SLASH))
                  return false;
              this._attemptCharCodeUntilFn(isNotWhitespace);
              if (!this._attemptStrCaseInsensitive(lowercaseTagName))
                  return false;
              this._attemptCharCodeUntilFn(isNotWhitespace);
              return this._attemptCharCode(chars.$GT);
          });
          this._beginToken(TokenType.TAG_CLOSE, textToken.sourceSpan.end);
          this._endToken([null, lowercaseTagName]);
      }
      _consumeTagOpenStart(start) {
          this._beginToken(TokenType.TAG_OPEN_START, start);
          const parts = this._consumePrefixAndName();
          this._endToken(parts);
      }
      _consumeAttributeName() {
          this._beginToken(TokenType.ATTR_NAME);
          const prefixAndName = this._consumePrefixAndName();
          this._endToken(prefixAndName);
      }
      _consumeAttributeValue() {
          this._beginToken(TokenType.ATTR_VALUE);
          let value;
          if (this._peek === chars.$SQ || this._peek === chars.$DQ) {
              const quoteChar = this._peek;
              this._advance();
              const parts = [];
              while (this._peek !== quoteChar) {
                  parts.push(this._readChar(this._options.decodeEntities));
              }
              value = parts.join('');
              this._advance();
          }
          else {
              const valueStart = this._index;
              this._requireCharCodeUntilFn(isNameEnd, 1);
              value = this._input.substring(valueStart, this._index);
          }
          this._endToken([this._processCarriageReturns(value)]);
      }
      _consumeTagOpenEnd() {
          const tokenType = this._attemptCharCode(chars.$SLASH)
              ? TokenType.TAG_OPEN_END_VOID
              : TokenType.TAG_OPEN_END;
          this._beginToken(tokenType);
          this._requireCharCode(chars.$GT);
          this._endToken([]);
      }
      _consumeTagClose(start) {
          this._beginToken(TokenType.TAG_CLOSE, start);
          this._attemptCharCodeUntilFn(isNotWhitespace);
          const prefixAndName = this._consumePrefixAndName();
          this._attemptCharCodeUntilFn(isNotWhitespace);
          this._requireCharCode(chars.$GT);
          this._endToken(prefixAndName);
      }
      _consumeText() {
          const start = this._getLocation();
          this._beginToken(TokenType.TEXT, start);
          const parts = [];
          do {
              if (this._interpolationConfig && this._attemptStr(this._interpolationConfig.start)) {
                  parts.push(this._interpolationConfig.start);
                  this._inInterpolation = true;
              }
              else if (this._interpolationConfig &&
                  this._inInterpolation &&
                  this._attemptStr(this._interpolationConfig.end)) {
                  parts.push(this._interpolationConfig.end);
                  this._inInterpolation = false;
              }
              else {
                  parts.push(this._readChar(this._options.decodeEntities));
              }
          } while (!this._isTextEnd());
          this._endToken([this._processCarriageReturns(parts.join(''))]);
      }
      _isTextEnd() {
          if (this._peek === chars.$LT || this._peek === chars.$EOF) {
              return true;
          }
          return false;
      }
      _savePosition() {
          return [this._peek, this._index, this._column, this._line, this.tokens.length];
      }
      _readUntil(char) {
          const start = this._index;
          this._attemptUntilChar(char);
          return this._input.substring(start, this._index);
      }
      _restorePosition(position) {
          this._peek = position[0];
          this._index = position[1];
          this._column = position[2];
          this._line = position[3];
          const nbTokens = position[4];
          if (nbTokens < this.tokens.length) {
              // remove any extra tokens
              this.tokens = this.tokens.slice(0, nbTokens);
          }
      }
  }
  function isNotWhitespace(code) {
      return !chars.isWhitespace(code) || code === chars.$EOF;
  }
  function isNameEnd(code) {
      return (chars.isWhitespace(code) ||
          code === chars.$GT ||
          code === chars.$SLASH ||
          code === chars.$SQ ||
          code === chars.$DQ ||
          code === chars.$EQ);
  }
  function isPrefixEnd(code) {
      return ((code < chars.$a || chars.$z < code) &&
          (code < chars.$A || chars.$Z < code) &&
          (code < chars.$0 || code > chars.$9));
  }
  function isDigitEntityEnd(code) {
      return code == chars.$SEMICOLON || code == chars.$EOF || !chars.isAsciiHexDigit(code);
  }
  function isNamedEntityEnd(code) {
      return code == chars.$SEMICOLON || code == chars.$EOF || !chars.isAsciiLetter(code);
  }
  function compareCharCodeCaseInsensitive(code1, code2) {
      return toUpperCaseCharCode(code1) == toUpperCaseCharCode(code2);
  }
  function toUpperCaseCharCode(code) {
      return code >= chars.$a && code <= chars.$z ? code - chars.$a + chars.$A : code;
  }
  function mergeTextTokens(srcTokens) {
      const dstTokens = [];
      let lastDstToken = undefined;
      for (let i = 0; i < srcTokens.length; i++) {
          const token = srcTokens[i];
          if (lastDstToken && lastDstToken.type == TokenType.TEXT && token.type == TokenType.TEXT) {
              lastDstToken.parts[0] += token.parts[0];
              lastDstToken.sourceSpan.end = token.sourceSpan.end;
          }
          else {
              lastDstToken = token;
              dstTokens.push(lastDstToken);
          }
      }
      return dstTokens;
  }

  },{"./chars":35,"./interpolation_config":38,"./parse_util":40,"./tags":43}],40:[function(require,module,exports){
  "use strict";
  var __importStar = (this && this.__importStar) || function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
      result["default"] = mod;
      return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  const chars = __importStar(require("./chars"));
  class ParseLocation {
      constructor(file, offset, line, col) {
          this.file = file;
          this.offset = offset;
          this.line = line;
          this.col = col;
      }
      toString() {
          return this.offset != null ? `${this.file.url}@${this.line}:${this.col}` : this.file.url;
      }
      moveBy(delta) {
          const source = this.file.content;
          const len = source.length;
          let offset = this.offset;
          let line = this.line;
          let col = this.col;
          while (offset > 0 && delta < 0) {
              offset--;
              delta++;
              const ch = source.charCodeAt(offset);
              if (ch == chars.$LF) {
                  line--;
                  const priorLine = source.substr(0, offset - 1).lastIndexOf(String.fromCharCode(chars.$LF));
                  col = priorLine > 0 ? offset - priorLine : offset;
              }
              else {
                  col--;
              }
          }
          while (offset < len && delta > 0) {
              const ch = source.charCodeAt(offset);
              offset++;
              delta--;
              if (ch == chars.$LF) {
                  line++;
                  col = 0;
              }
              else {
                  col++;
              }
          }
          return new ParseLocation(this.file, offset, line, col);
      }
      // Return the source around the location
      // Up to `maxChars` or `maxLines` on each side of the location
      getContext(maxChars, maxLines) {
          const content = this.file.content;
          let startOffset = this.offset;
          if (startOffset != null) {
              if (startOffset > content.length - 1) {
                  startOffset = content.length - 1;
              }
              let endOffset = startOffset;
              let ctxChars = 0;
              let ctxLines = 0;
              while (ctxChars < maxChars && startOffset > 0) {
                  startOffset--;
                  ctxChars++;
                  if (content[startOffset] == '\n') {
                      if (++ctxLines == maxLines) {
                          break;
                      }
                  }
              }
              ctxChars = 0;
              ctxLines = 0;
              while (ctxChars < maxChars && endOffset < content.length - 1) {
                  endOffset++;
                  ctxChars++;
                  if (content[endOffset] == '\n') {
                      if (++ctxLines == maxLines) {
                          break;
                      }
                  }
              }
              return {
                  before: content.substring(startOffset, this.offset),
                  after: content.substring(this.offset, endOffset + 1)
              };
          }
          return null;
      }
  }
  exports.ParseLocation = ParseLocation;
  class ParseSourceFile {
      constructor(content, url) {
          this.content = content;
          this.url = url;
      }
  }
  exports.ParseSourceFile = ParseSourceFile;
  class ParseSourceSpan {
      constructor(start, end, details = null) {
          this.start = start;
          this.end = end;
          this.details = details;
      }
      toString() {
          return this.start.file.content.substring(this.start.offset, this.end.offset);
      }
  }
  exports.ParseSourceSpan = ParseSourceSpan;
  var ParseErrorLevel;
  (function (ParseErrorLevel) {
      ParseErrorLevel[ParseErrorLevel["WARNING"] = 0] = "WARNING";
      ParseErrorLevel[ParseErrorLevel["ERROR"] = 1] = "ERROR";
  })(ParseErrorLevel = exports.ParseErrorLevel || (exports.ParseErrorLevel = {}));
  class ParseError {
      constructor(span, msg, level = ParseErrorLevel.ERROR) {
          this.span = span;
          this.msg = msg;
          this.level = level;
      }
      contextualMessage() {
          const ctx = this.span.start.getContext(100, 3);
          return ctx ? `${this.msg} ("${ctx.before}[${ParseErrorLevel[this.level]} ->]${ctx.after}")` : this.msg;
      }
      toString() {
          const details = this.span.details ? `, ${this.span.details}` : '';
          return `${this.contextualMessage()}: ${this.span.start}${details}`;
      }
  }
  exports.ParseError = ParseError;

  },{"./chars":35}],41:[function(require,module,exports){
  "use strict";
  var __importStar = (this && this.__importStar) || function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
      result["default"] = mod;
      return result;
  };
  Object.defineProperty(exports, "__esModule", { value: true });
  const parse_util_1 = require("./parse_util");
  const html = __importStar(require("./ast"));
  const interpolation_config_1 = require("./interpolation_config");
  const lex = __importStar(require("./lexer"));
  const tags_1 = require("./tags");
  const html_tags_1 = require("./html_tags");
  class TreeError extends parse_util_1.ParseError {
      constructor(elementName, span, msg) {
          super(span, msg);
          this.elementName = elementName;
      }
      static create(elementName, span, msg) {
          return new TreeError(elementName, span, msg);
      }
  }
  exports.TreeError = TreeError;
  class ParseTreeResult {
      constructor(rootNodes, errors) {
          this.rootNodes = rootNodes;
          this.errors = errors;
      }
  }
  exports.ParseTreeResult = ParseTreeResult;
  class Parser {
      constructor(options = {
          decodeEntities: true,
          ignoreFirstLf: true,
          insertRequiredParents: false,
          selfClosingElements: false,
          selfClosingCustomElements: false
      }, getTagDefinition) {
          this.options = options;
          this.getTagDefinition = getTagDefinition;
      }
      parse(source, url, interpolationConfig = interpolation_config_1.DEFAULT_INTERPOLATION_CONFIG) {
          const tokensAndErrors = lex.tokenize(source, url, this.getTagDefinition, interpolationConfig, this.options);
          const treeAndErrors = new _TreeBuilder(this.options, tokensAndErrors.tokens, this.getTagDefinition).build();
          return new ParseTreeResult(treeAndErrors.rootNodes, tokensAndErrors.errors.concat(treeAndErrors.errors));
      }
  }
  exports.Parser = Parser;
  class _TreeBuilder {
      constructor(options, tokens, getTagDefinition) {
          this.options = options;
          this.tokens = tokens;
          this.getTagDefinition = getTagDefinition;
          this._index = -1;
          this._rootNodes = [];
          this._errors = [];
          this._elementStack = [];
          this._advance();
      }
      build() {
          while (this._peek.type !== lex.TokenType.EOF) {
              if (this._peek.type === lex.TokenType.DOC_TYPE) {
                  this._consumeDoctype(this._advance());
              }
              else if (this._peek.type === lex.TokenType.TAG_OPEN_START) {
                  this._consumeStartTag(this._advance());
              }
              else if (this._peek.type === lex.TokenType.TAG_CLOSE) {
                  this._consumeEndTag(this._advance());
              }
              else if (this._peek.type === lex.TokenType.CDATA_START) {
                  this._closeVoidElement();
                  this._consumeCdata(this._advance());
              }
              else if (this._peek.type === lex.TokenType.COMMENT_START) {
                  this._closeVoidElement();
                  this._consumeComment(this._advance());
              }
              else if (this._peek.type === lex.TokenType.TEXT ||
                  this._peek.type === lex.TokenType.RAW_TEXT ||
                  this._peek.type === lex.TokenType.ESCAPABLE_RAW_TEXT) {
                  this._closeVoidElement();
                  this._consumeText(this._advance());
              }
              else {
                  // Skip all other tokens...
                  this._advance();
              }
          }
          return new ParseTreeResult(this._rootNodes, this._errors);
      }
      _advance() {
          const prev = this._peek;
          if (this._index < this.tokens.length - 1) {
              // Note: there is always an EOF token at the end
              this._index++;
          }
          this._peek = this.tokens[this._index];
          return prev;
      }
      _advanceIf(type) {
          if (this._peek.type === type) {
              return this._advance();
          }
          return null;
      }
      _consumeCdata(startToken) {
          this._consumeText(this._advance());
          this._advanceIf(lex.TokenType.CDATA_END);
      }
      _consumeComment(token) {
          const text = this._advanceIf(lex.TokenType.RAW_TEXT);
          this._advanceIf(lex.TokenType.COMMENT_END);
          const value = text != null ? text.parts[0] : null;
          this._addToParent(new html.Comment(value, token.sourceSpan));
      }
      _consumeDoctype(token) {
          const value = token.parts.length ? token.parts[0] : null;
          this._addToParent(new html.Doctype(value, token.sourceSpan));
      }
      _consumeText(token) {
          let text = token.parts[0];
          if (text.length > 0 && text[0] == '\n') {
              const parent = this._getParentElement();
              if (parent != null &&
                  parent.children.length == 0 &&
                  this.getTagDefinition(parent.name, this.options.ignoreFirstLf, this.options.selfClosingElements)
                      .ignoreFirstLf) {
                  text = text.substring(1);
              }
          }
          if (text.length > 0) {
              this._addToParent(new html.Text(text, token.sourceSpan));
          }
      }
      _closeVoidElement() {
          const el = this._getParentElement();
          if (el &&
              this.getTagDefinition(el.name, this.options.ignoreFirstLf, this.options.selfClosingElements).isVoid) {
              this._elementStack.pop();
          }
      }
      _consumeStartTag(startTagToken) {
          const prefix = startTagToken.parts[0];
          const name = startTagToken.parts[1];
          const attrs = [];
          while (this._peek.type === lex.TokenType.ATTR_NAME) {
              attrs.push(this._consumeAttr(this._advance()));
          }
          const nameAndNsInfo = this._getElementNameAndNsInfo(prefix, name, this._getParentElement());
          let selfClosing = false;
          // Note: There could have been a tokenizer error
          // so that we don't get a token for the end tag...
          if (this._peek.type === lex.TokenType.TAG_OPEN_END_VOID) {
              this._advance();
              selfClosing = true;
              const tagDef = this.getTagDefinition(nameAndNsInfo.fullName, this.options.ignoreFirstLf, this.options.selfClosingElements);
              if (!(tagDef.canSelfClose ||
                  tags_1.getNsPrefix(nameAndNsInfo.fullName) !== null ||
                  tagDef.isVoid ||
                  // allow self-closing custom elements
                  (this.options.selfClosingCustomElements && html_tags_1.isKnownHTMLTag(nameAndNsInfo.fullName) === false))) {
                  this._errors.push(TreeError.create(nameAndNsInfo.fullName, startTagToken.sourceSpan, `Only void, foreign or custom elements can be self closed "${startTagToken.parts[1]}"`));
              }
          }
          else if (this._peek.type === lex.TokenType.TAG_OPEN_END) {
              this._advance();
              selfClosing = false;
          }
          const end = this._peek.sourceSpan.start;
          const span = new parse_util_1.ParseSourceSpan(startTagToken.sourceSpan.start, end);
          const el = new html.Element(nameAndNsInfo.fullName, attrs, [], nameAndNsInfo.implicitNs, span, span, undefined);
          this._pushElement(el);
          if (selfClosing) {
              this._popElement(nameAndNsInfo.fullName);
              el.endSourceSpan = span;
          }
      }
      _pushElement(el) {
          const parentEl = this._getParentElement();
          if (parentEl &&
              this.getTagDefinition(parentEl.name, this.options.ignoreFirstLf, this.options.selfClosingElements).isClosedByChild(el.name)) {
              this._elementStack.pop();
          }
          if (this.options.insertRequiredParents) {
              const tagDef = this.getTagDefinition(el.name, this.options.ignoreFirstLf, this.options.selfClosingElements);
              const { parent, container } = this._getParentElementSkippingContainers();
              if (parent && tagDef.requireExtraParent(parent.name)) {
                  const newParent = new html.Element(tagDef.parentToAdd, [], [], el.implicitNs, el.sourceSpan, el.startSourceSpan, el.endSourceSpan);
                  this._insertBeforeContainer(parent, container, newParent);
              }
          }
          this._addToParent(el);
          this._elementStack.push(el);
      }
      _consumeEndTag(endTagToken) {
          const nameInfo = this._getElementNameAndNsInfo(endTagToken.parts[0], endTagToken.parts[1], this._getParentElement());
          if (this._getParentElement()) {
              this._getParentElement().endSourceSpan = endTagToken.sourceSpan;
          }
          // if (this.getTagDefinition(nameInfo.fullName, this.options.ignoreFirstLf, this.options.selfClosingElements)
          //     .isVoid) {
          //     this._errors.push(TreeError.create(nameInfo.fullName, endTagToken.sourceSpan, `Void elements do not have end tags "${endTagToken.parts[1]}"`));
          // }
          // else if (!this._popElement(nameInfo.fullName)) {
          //     const errMsg = `Unexpected closing tag "${nameInfo.fullName}". It may happen when the tag has already been closed by another tag. For more info see https://www.w3.org/TR/html5/syntax.html#closing-elements-that-have-implied-end-tags`;
          //     this._errors.push(TreeError.create(nameInfo.fullName, endTagToken.sourceSpan, errMsg));
          // }
      }
      _popElement(fullName) {
          for (let stackIndex = this._elementStack.length - 1; stackIndex >= 0; stackIndex--) {
              const el = this._elementStack[stackIndex];
              if (el.name == fullName) {
                  this._elementStack.splice(stackIndex, this._elementStack.length - stackIndex);
                  return true;
              }
              if (!this.getTagDefinition(el.name, this.options.ignoreFirstLf, this.options.selfClosingElements)
                  .closedByParent) {
                  return false;
              }
          }
          return false;
      }
      _consumeAttr(attrName) {
          const fullName = tags_1.mergeNsAndName(attrName.parts[0], attrName.parts[1]);
          let implicitNs = attrName.parts[0] != null;
          let end = attrName.sourceSpan.end;
          let value = '';
          let valueSpan = undefined;
          if (this._peek.type === lex.TokenType.ATTR_VALUE) {
              const valueToken = this._advance();
              value = valueToken.parts[0];
              end = valueToken.sourceSpan.end;
              valueSpan = valueToken.sourceSpan;
          }
          return new html.Attribute(fullName, value, implicitNs, new parse_util_1.ParseSourceSpan(attrName.sourceSpan.start, end), valueSpan);
      }
      _getParentElement() {
          return this._elementStack.length > 0 ? this._elementStack[this._elementStack.length - 1] : null;
      }
      /**
       * Returns the parent in the DOM and the container.
       *
       * `<ng-container>` elements are skipped as they are not rendered as DOM element.
       */
      _getParentElementSkippingContainers() {
          let container = null;
          for (let i = this._elementStack.length - 1; i >= 0; i--) {
              if (!tags_1.isNgContainer(this._elementStack[i].name)) {
                  return { parent: this._elementStack[i], container };
              }
              container = this._elementStack[i];
          }
          return { parent: null, container };
      }
      _addToParent(node) {
          const parent = this._getParentElement();
          if (parent != null) {
              parent.children.push(node);
          }
          else {
              this._rootNodes.push(node);
          }
      }
      /**
       * Insert a node between the parent and the container.
       * When no container is given, the node is appended as a child of the parent.
       * Also updates the element stack accordingly.
       *
       * @internal
       */
      _insertBeforeContainer(parent, container, node) {
          if (!container) {
              this._addToParent(node);
              this._elementStack.push(node);
          }
          else {
              if (parent) {
                  // replace the container with the new node in the children
                  const index = parent.children.indexOf(container);
                  parent.children[index] = node;
              }
              else {
                  this._rootNodes.push(node);
              }
              node.children.push(container);
              this._elementStack.splice(this._elementStack.indexOf(container), 0, node);
          }
      }
      _getElementNameAndNsInfo(prefix, localName, parentElement) {
          let implicitNs = false;
          if (prefix == null) {
              prefix = this.getTagDefinition(localName, this.options.ignoreFirstLf, this.options.selfClosingElements)
                  .implicitNamespacePrefix;
              if (prefix) {
                  implicitNs = true;
              }
              if (prefix == null && parentElement != null) {
                  prefix = tags_1.getNsPrefix(parentElement.name);
                  if (prefix != null) {
                      implicitNs = true;
                  }
              }
          }
          return { fullName: tags_1.mergeNsAndName(prefix, localName), implicitNs };
      }
  }
  function lastOnStack(stack, element) {
      return stack.length > 0 && stack[stack.length - 1] === element;
  }

  },{"./ast":33,"./html_tags":37,"./interpolation_config":38,"./lexer":39,"./parse_util":40,"./tags":43}],42:[function(require,module,exports){
  "use strict";
  /**
   * @module
   * @description
   * Entry point for all APIs of the parser package.
   *
   */
  function __export(m) {
      for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
  }
  Object.defineProperty(exports, "__esModule", { value: true });
  __export(require("./html_parser"));
  __export(require("./ast"));
  __export(require("./parse_util"));
  __export(require("./tags"));

  },{"./ast":33,"./html_parser":36,"./parse_util":40,"./tags":43}],43:[function(require,module,exports){
  "use strict";
  Object.defineProperty(exports, "__esModule", { value: true });
  var TagContentType;
  (function (TagContentType) {
      TagContentType[TagContentType["RAW_TEXT"] = 0] = "RAW_TEXT";
      TagContentType[TagContentType["ESCAPABLE_RAW_TEXT"] = 1] = "ESCAPABLE_RAW_TEXT";
      TagContentType[TagContentType["PARSABLE_DATA"] = 2] = "PARSABLE_DATA";
  })(TagContentType = exports.TagContentType || (exports.TagContentType = {}));
  function splitNsName(elementName) {
      if (elementName[0] != ':') {
          return [null, elementName];
      }
      const colonIndex = elementName.indexOf(':', 1);
      if (colonIndex == -1) {
          throw new Error(`Unsupported format "${elementName}" expecting ":namespace:name"`);
      }
      return [elementName.slice(1, colonIndex), elementName.slice(colonIndex + 1)];
  }
  exports.splitNsName = splitNsName;
  // `<ng-container>` tags work the same regardless the namespace
  function isNgContainer(tagName) {
      return splitNsName(tagName)[1] === 'ng-container';
  }
  exports.isNgContainer = isNgContainer;
  // `<ng-content>` tags work the same regardless the namespace
  function isNgContent(tagName) {
      return splitNsName(tagName)[1] === 'ng-content';
  }
  exports.isNgContent = isNgContent;
  // `<ng-template>` tags work the same regardless the namespace
  function isNgTemplate(tagName) {
      return splitNsName(tagName)[1] === 'ng-template';
  }
  exports.isNgTemplate = isNgTemplate;
  function getNsPrefix(fullName) {
      return fullName === null ? null : splitNsName(fullName)[0];
  }
  exports.getNsPrefix = getNsPrefix;
  function mergeNsAndName(prefix, localName) {
      return prefix ? `:${prefix}:${localName}` : localName;
  }
  exports.mergeNsAndName = mergeNsAndName;
  // see http://www.w3.org/TR/html51/syntax.html#named-character-references
  // see https://html.spec.whatwg.org/multipage/entities.json
  // This list is not exhaustive to keep the compiler footprint low.
  // The `&#123;` / `&#x1ab;` syntax should be used when the named character reference does not
  // exist.
  exports.NAMED_ENTITIES = {
      Aacute: '\u00C1',
      aacute: '\u00E1',
      Acirc: '\u00C2',
      acirc: '\u00E2',
      acute: '\u00B4',
      AElig: '\u00C6',
      aelig: '\u00E6',
      Agrave: '\u00C0',
      agrave: '\u00E0',
      alefsym: '\u2135',
      Alpha: '\u0391',
      alpha: '\u03B1',
      amp: '&',
      and: '\u2227',
      ang: '\u2220',
      apos: '\u0027',
      Aring: '\u00C5',
      aring: '\u00E5',
      asymp: '\u2248',
      Atilde: '\u00C3',
      atilde: '\u00E3',
      Auml: '\u00C4',
      auml: '\u00E4',
      bdquo: '\u201E',
      Beta: '\u0392',
      beta: '\u03B2',
      brvbar: '\u00A6',
      bull: '\u2022',
      cap: '\u2229',
      Ccedil: '\u00C7',
      ccedil: '\u00E7',
      cedil: '\u00B8',
      cent: '\u00A2',
      Chi: '\u03A7',
      chi: '\u03C7',
      circ: '\u02C6',
      clubs: '\u2663',
      cong: '\u2245',
      copy: '\u00A9',
      crarr: '\u21B5',
      cup: '\u222A',
      curren: '\u00A4',
      dagger: '\u2020',
      Dagger: '\u2021',
      darr: '\u2193',
      dArr: '\u21D3',
      deg: '\u00B0',
      Delta: '\u0394',
      delta: '\u03B4',
      diams: '\u2666',
      divide: '\u00F7',
      Eacute: '\u00C9',
      eacute: '\u00E9',
      Ecirc: '\u00CA',
      ecirc: '\u00EA',
      Egrave: '\u00C8',
      egrave: '\u00E8',
      empty: '\u2205',
      emsp: '\u2003',
      ensp: '\u2002',
      Epsilon: '\u0395',
      epsilon: '\u03B5',
      equiv: '\u2261',
      Eta: '\u0397',
      eta: '\u03B7',
      ETH: '\u00D0',
      eth: '\u00F0',
      Euml: '\u00CB',
      euml: '\u00EB',
      euro: '\u20AC',
      exist: '\u2203',
      fnof: '\u0192',
      forall: '\u2200',
      frac12: '\u00BD',
      frac14: '\u00BC',
      frac34: '\u00BE',
      frasl: '\u2044',
      Gamma: '\u0393',
      gamma: '\u03B3',
      ge: '\u2265',
      gt: '>',
      harr: '\u2194',
      hArr: '\u21D4',
      hearts: '\u2665',
      hellip: '\u2026',
      Iacute: '\u00CD',
      iacute: '\u00ED',
      Icirc: '\u00CE',
      icirc: '\u00EE',
      iexcl: '\u00A1',
      Igrave: '\u00CC',
      igrave: '\u00EC',
      image: '\u2111',
      infin: '\u221E',
      int: '\u222B',
      Iota: '\u0399',
      iota: '\u03B9',
      iquest: '\u00BF',
      isin: '\u2208',
      Iuml: '\u00CF',
      iuml: '\u00EF',
      Kappa: '\u039A',
      kappa: '\u03BA',
      Lambda: '\u039B',
      lambda: '\u03BB',
      lang: '\u27E8',
      laquo: '\u00AB',
      larr: '\u2190',
      lArr: '\u21D0',
      lceil: '\u2308',
      ldquo: '\u201C',
      le: '\u2264',
      lfloor: '\u230A',
      lowast: '\u2217',
      loz: '\u25CA',
      lrm: '\u200E',
      lsaquo: '\u2039',
      lsquo: '\u2018',
      lt: '<',
      macr: '\u00AF',
      mdash: '\u2014',
      micro: '\u00B5',
      middot: '\u00B7',
      minus: '\u2212',
      Mu: '\u039C',
      mu: '\u03BC',
      nabla: '\u2207',
      nbsp: '\u00A0',
      ndash: '\u2013',
      ne: '\u2260',
      ni: '\u220B',
      not: '\u00AC',
      notin: '\u2209',
      nsub: '\u2284',
      Ntilde: '\u00D1',
      ntilde: '\u00F1',
      Nu: '\u039D',
      nu: '\u03BD',
      Oacute: '\u00D3',
      oacute: '\u00F3',
      Ocirc: '\u00D4',
      ocirc: '\u00F4',
      OElig: '\u0152',
      oelig: '\u0153',
      Ograve: '\u00D2',
      ograve: '\u00F2',
      oline: '\u203E',
      Omega: '\u03A9',
      omega: '\u03C9',
      Omicron: '\u039F',
      omicron: '\u03BF',
      oplus: '\u2295',
      or: '\u2228',
      ordf: '\u00AA',
      ordm: '\u00BA',
      Oslash: '\u00D8',
      oslash: '\u00F8',
      Otilde: '\u00D5',
      otilde: '\u00F5',
      otimes: '\u2297',
      Ouml: '\u00D6',
      ouml: '\u00F6',
      para: '\u00B6',
      permil: '\u2030',
      perp: '\u22A5',
      Phi: '\u03A6',
      phi: '\u03C6',
      Pi: '\u03A0',
      pi: '\u03C0',
      piv: '\u03D6',
      plusmn: '\u00B1',
      pound: '\u00A3',
      prime: '\u2032',
      Prime: '\u2033',
      prod: '\u220F',
      prop: '\u221D',
      Psi: '\u03A8',
      psi: '\u03C8',
      quot: '\u0022',
      radic: '\u221A',
      rang: '\u27E9',
      raquo: '\u00BB',
      rarr: '\u2192',
      rArr: '\u21D2',
      rceil: '\u2309',
      rdquo: '\u201D',
      real: '\u211C',
      reg: '\u00AE',
      rfloor: '\u230B',
      Rho: '\u03A1',
      rho: '\u03C1',
      rlm: '\u200F',
      rsaquo: '\u203A',
      rsquo: '\u2019',
      sbquo: '\u201A',
      Scaron: '\u0160',
      scaron: '\u0161',
      sdot: '\u22C5',
      sect: '\u00A7',
      shy: '\u00AD',
      Sigma: '\u03A3',
      sigma: '\u03C3',
      sigmaf: '\u03C2',
      sim: '\u223C',
      spades: '\u2660',
      sub: '\u2282',
      sube: '\u2286',
      sum: '\u2211',
      sup: '\u2283',
      sup1: '\u00B9',
      sup2: '\u00B2',
      sup3: '\u00B3',
      supe: '\u2287',
      szlig: '\u00DF',
      Tau: '\u03A4',
      tau: '\u03C4',
      there4: '\u2234',
      Theta: '\u0398',
      theta: '\u03B8',
      thetasym: '\u03D1',
      thinsp: '\u2009',
      THORN: '\u00DE',
      thorn: '\u00FE',
      tilde: '\u02DC',
      times: '\u00D7',
      trade: '\u2122',
      Uacute: '\u00DA',
      uacute: '\u00FA',
      uarr: '\u2191',
      uArr: '\u21D1',
      Ucirc: '\u00DB',
      ucirc: '\u00FB',
      Ugrave: '\u00D9',
      ugrave: '\u00F9',
      uml: '\u00A8',
      upsih: '\u03D2',
      Upsilon: '\u03A5',
      upsilon: '\u03C5',
      Uuml: '\u00DC',
      uuml: '\u00FC',
      weierp: '\u2118',
      Xi: '\u039E',
      xi: '\u03BE',
      Yacute: '\u00DD',
      yacute: '\u00FD',
      yen: '\u00A5',
      yuml: '\u00FF',
      Yuml: '\u0178',
      Zeta: '\u0396',
      zeta: '\u03B6',
      zwj: '\u200D',
      zwnj: '\u200C'
  };
  // The &ngsp; pseudo-entity is denoting a space. see:
  // https://github.com/dart-lang/angular/blob/0bb611387d29d65b5af7f9d2515ab571fd3fbee4/_tests/test/compiler/preserve_whitespace_test.dart
  exports.NGSP_UNICODE = '\uE500';
  exports.NAMED_ENTITIES['ngsp'] = exports.NGSP_UNICODE;

  },{}],44:[function(require,module,exports){
  'use strict'

  module.exports = iterate

  var own = {}.hasOwnProperty

  function iterate(values, callback, context) {
    var index = -1
    var result

    if (!values) {
      throw new Error('Iterate requires that |this| not be ' + values)
    }

    if (!own.call(values, 'length')) {
      throw new Error('Iterate requires that |this| has a `length`')
    }

    if (typeof callback !== 'function') {
      throw new Error('`callback` must be a function')
    }

    // The length might change, so we do not cache it.
    while (++index < values.length) {
      // Skip missing values.
      if (!(index in values)) {
        continue
      }

      result = callback.call(context, values[index], index, values)

      // If `callback` returns a `number`, move `index` over to `number`.
      if (typeof result === 'number') {
        // Make sure that negative numbers do not break the loop.
        if (result < 0) {
          index = 0
        }

        index = result - 1
      }
    }
  }

  },{}],45:[function(require,module,exports){
  'use strict'

  module.exports = bail

  function bail(err) {
    if (err) {
      throw err
    }
  }

  },{}],46:[function(require,module,exports){

  },{}],47:[function(require,module,exports){
  module.exports={
    "nbsp": " ",
    "iexcl": "¡",
    "cent": "¢",
    "pound": "£",
    "curren": "¤",
    "yen": "¥",
    "brvbar": "¦",
    "sect": "§",
    "uml": "¨",
    "copy": "©",
    "ordf": "ª",
    "laquo": "«",
    "not": "¬",
    "shy": "­",
    "reg": "®",
    "macr": "¯",
    "deg": "°",
    "plusmn": "±",
    "sup2": "²",
    "sup3": "³",
    "acute": "´",
    "micro": "µ",
    "para": "¶",
    "middot": "·",
    "cedil": "¸",
    "sup1": "¹",
    "ordm": "º",
    "raquo": "»",
    "frac14": "¼",
    "frac12": "½",
    "frac34": "¾",
    "iquest": "¿",
    "Agrave": "À",
    "Aacute": "Á",
    "Acirc": "Â",
    "Atilde": "Ã",
    "Auml": "Ä",
    "Aring": "Å",
    "AElig": "Æ",
    "Ccedil": "Ç",
    "Egrave": "È",
    "Eacute": "É",
    "Ecirc": "Ê",
    "Euml": "Ë",
    "Igrave": "Ì",
    "Iacute": "Í",
    "Icirc": "Î",
    "Iuml": "Ï",
    "ETH": "Ð",
    "Ntilde": "Ñ",
    "Ograve": "Ò",
    "Oacute": "Ó",
    "Ocirc": "Ô",
    "Otilde": "Õ",
    "Ouml": "Ö",
    "times": "×",
    "Oslash": "Ø",
    "Ugrave": "Ù",
    "Uacute": "Ú",
    "Ucirc": "Û",
    "Uuml": "Ü",
    "Yacute": "Ý",
    "THORN": "Þ",
    "szlig": "ß",
    "agrave": "à",
    "aacute": "á",
    "acirc": "â",
    "atilde": "ã",
    "auml": "ä",
    "aring": "å",
    "aelig": "æ",
    "ccedil": "ç",
    "egrave": "è",
    "eacute": "é",
    "ecirc": "ê",
    "euml": "ë",
    "igrave": "ì",
    "iacute": "í",
    "icirc": "î",
    "iuml": "ï",
    "eth": "ð",
    "ntilde": "ñ",
    "ograve": "ò",
    "oacute": "ó",
    "ocirc": "ô",
    "otilde": "õ",
    "ouml": "ö",
    "divide": "÷",
    "oslash": "ø",
    "ugrave": "ù",
    "uacute": "ú",
    "ucirc": "û",
    "uuml": "ü",
    "yacute": "ý",
    "thorn": "þ",
    "yuml": "ÿ",
    "fnof": "ƒ",
    "Alpha": "Α",
    "Beta": "Β",
    "Gamma": "Γ",
    "Delta": "Δ",
    "Epsilon": "Ε",
    "Zeta": "Ζ",
    "Eta": "Η",
    "Theta": "Θ",
    "Iota": "Ι",
    "Kappa": "Κ",
    "Lambda": "Λ",
    "Mu": "Μ",
    "Nu": "Ν",
    "Xi": "Ξ",
    "Omicron": "Ο",
    "Pi": "Π",
    "Rho": "Ρ",
    "Sigma": "Σ",
    "Tau": "Τ",
    "Upsilon": "Υ",
    "Phi": "Φ",
    "Chi": "Χ",
    "Psi": "Ψ",
    "Omega": "Ω",
    "alpha": "α",
    "beta": "β",
    "gamma": "γ",
    "delta": "δ",
    "epsilon": "ε",
    "zeta": "ζ",
    "eta": "η",
    "theta": "θ",
    "iota": "ι",
    "kappa": "κ",
    "lambda": "λ",
    "mu": "μ",
    "nu": "ν",
    "xi": "ξ",
    "omicron": "ο",
    "pi": "π",
    "rho": "ρ",
    "sigmaf": "ς",
    "sigma": "σ",
    "tau": "τ",
    "upsilon": "υ",
    "phi": "φ",
    "chi": "χ",
    "psi": "ψ",
    "omega": "ω",
    "thetasym": "ϑ",
    "upsih": "ϒ",
    "piv": "ϖ",
    "bull": "•",
    "hellip": "…",
    "prime": "′",
    "Prime": "″",
    "oline": "‾",
    "frasl": "⁄",
    "weierp": "℘",
    "image": "ℑ",
    "real": "ℜ",
    "trade": "™",
    "alefsym": "ℵ",
    "larr": "←",
    "uarr": "↑",
    "rarr": "→",
    "darr": "↓",
    "harr": "↔",
    "crarr": "↵",
    "lArr": "⇐",
    "uArr": "⇑",
    "rArr": "⇒",
    "dArr": "⇓",
    "hArr": "⇔",
    "forall": "∀",
    "part": "∂",
    "exist": "∃",
    "empty": "∅",
    "nabla": "∇",
    "isin": "∈",
    "notin": "∉",
    "ni": "∋",
    "prod": "∏",
    "sum": "∑",
    "minus": "−",
    "lowast": "∗",
    "radic": "√",
    "prop": "∝",
    "infin": "∞",
    "ang": "∠",
    "and": "∧",
    "or": "∨",
    "cap": "∩",
    "cup": "∪",
    "int": "∫",
    "there4": "∴",
    "sim": "∼",
    "cong": "≅",
    "asymp": "≈",
    "ne": "≠",
    "equiv": "≡",
    "le": "≤",
    "ge": "≥",
    "sub": "⊂",
    "sup": "⊃",
    "nsub": "⊄",
    "sube": "⊆",
    "supe": "⊇",
    "oplus": "⊕",
    "otimes": "⊗",
    "perp": "⊥",
    "sdot": "⋅",
    "lceil": "⌈",
    "rceil": "⌉",
    "lfloor": "⌊",
    "rfloor": "⌋",
    "lang": "〈",
    "rang": "〉",
    "loz": "◊",
    "spades": "♠",
    "clubs": "♣",
    "hearts": "♥",
    "diams": "♦",
    "quot": "\"",
    "amp": "&",
    "lt": "<",
    "gt": ">",
    "OElig": "Œ",
    "oelig": "œ",
    "Scaron": "Š",
    "scaron": "š",
    "Yuml": "Ÿ",
    "circ": "ˆ",
    "tilde": "˜",
    "ensp": " ",
    "emsp": " ",
    "thinsp": " ",
    "zwnj": "‌",
    "zwj": "‍",
    "lrm": "‎",
    "rlm": "‏",
    "ndash": "–",
    "mdash": "—",
    "lsquo": "‘",
    "rsquo": "’",
    "sbquo": "‚",
    "ldquo": "“",
    "rdquo": "”",
    "bdquo": "„",
    "dagger": "†",
    "Dagger": "‡",
    "permil": "‰",
    "lsaquo": "‹",
    "rsaquo": "›",
    "euro": "€"
  }

  },{}],48:[function(require,module,exports){
  module.exports={
    "AElig": "Æ",
    "AMP": "&",
    "Aacute": "Á",
    "Acirc": "Â",
    "Agrave": "À",
    "Aring": "Å",
    "Atilde": "Ã",
    "Auml": "Ä",
    "COPY": "©",
    "Ccedil": "Ç",
    "ETH": "Ð",
    "Eacute": "É",
    "Ecirc": "Ê",
    "Egrave": "È",
    "Euml": "Ë",
    "GT": ">",
    "Iacute": "Í",
    "Icirc": "Î",
    "Igrave": "Ì",
    "Iuml": "Ï",
    "LT": "<",
    "Ntilde": "Ñ",
    "Oacute": "Ó",
    "Ocirc": "Ô",
    "Ograve": "Ò",
    "Oslash": "Ø",
    "Otilde": "Õ",
    "Ouml": "Ö",
    "QUOT": "\"",
    "REG": "®",
    "THORN": "Þ",
    "Uacute": "Ú",
    "Ucirc": "Û",
    "Ugrave": "Ù",
    "Uuml": "Ü",
    "Yacute": "Ý",
    "aacute": "á",
    "acirc": "â",
    "acute": "´",
    "aelig": "æ",
    "agrave": "à",
    "amp": "&",
    "aring": "å",
    "atilde": "ã",
    "auml": "ä",
    "brvbar": "¦",
    "ccedil": "ç",
    "cedil": "¸",
    "cent": "¢",
    "copy": "©",
    "curren": "¤",
    "deg": "°",
    "divide": "÷",
    "eacute": "é",
    "ecirc": "ê",
    "egrave": "è",
    "eth": "ð",
    "euml": "ë",
    "frac12": "½",
    "frac14": "¼",
    "frac34": "¾",
    "gt": ">",
    "iacute": "í",
    "icirc": "î",
    "iexcl": "¡",
    "igrave": "ì",
    "iquest": "¿",
    "iuml": "ï",
    "laquo": "«",
    "lt": "<",
    "macr": "¯",
    "micro": "µ",
    "middot": "·",
    "nbsp": " ",
    "not": "¬",
    "ntilde": "ñ",
    "oacute": "ó",
    "ocirc": "ô",
    "ograve": "ò",
    "ordf": "ª",
    "ordm": "º",
    "oslash": "ø",
    "otilde": "õ",
    "ouml": "ö",
    "para": "¶",
    "plusmn": "±",
    "pound": "£",
    "quot": "\"",
    "raquo": "»",
    "reg": "®",
    "sect": "§",
    "shy": "­",
    "sup1": "¹",
    "sup2": "²",
    "sup3": "³",
    "szlig": "ß",
    "thorn": "þ",
    "times": "×",
    "uacute": "ú",
    "ucirc": "û",
    "ugrave": "ù",
    "uml": "¨",
    "uuml": "ü",
    "yacute": "ý",
    "yen": "¥",
    "yuml": "ÿ"
  }

  },{}],49:[function(require,module,exports){
  'use strict'

  module.exports = collapse

  // `collapse(' \t\nbar \nbaz\t') // ' bar baz '`
  function collapse(value) {
    return String(value).replace(/\s+/g, ' ')
  }

  },{}],50:[function(require,module,exports){
  'use strict'

  exports.parse = parse
  exports.stringify = stringify

  var comma = ','
  var space = ' '
  var empty = ''

  // Parse comma-separated tokens to an array.
  function parse(value) {
    var values = []
    var input = String(value || empty)
    var index = input.indexOf(comma)
    var lastIndex = 0
    var end = false
    var val

    while (!end) {
      if (index === -1) {
        index = input.length
        end = true
      }

      val = input.slice(lastIndex, index).trim()

      if (val || !end) {
        values.push(val)
      }

      lastIndex = index + 1
      index = input.indexOf(comma, lastIndex)
    }

    return values
  }

  // Compile an array to comma-separated tokens.
  // `options.padLeft` (default: `true`) pads a space left of each token, and
  // `options.padRight` (default: `false`) pads a space to the right of each token.
  function stringify(values, options) {
    var settings = options || {}
    var left = settings.padLeft === false ? empty : space
    var right = settings.padRight ? space : empty

    // Ensure the last empty entry is seen.
    if (values[values.length - 1] === empty) {
      values = values.concat(empty)
    }

    return values.join(right + comma + left).trim()
  }

  },{}],51:[function(require,module,exports){
  'use strict';

  var hasOwn = Object.prototype.hasOwnProperty;
  var toStr = Object.prototype.toString;
  var defineProperty = Object.defineProperty;
  var gOPD = Object.getOwnPropertyDescriptor;

  var isArray = function isArray(arr) {
    if (typeof Array.isArray === 'function') {
      return Array.isArray(arr);
    }

    return toStr.call(arr) === '[object Array]';
  };

  var isPlainObject = function isPlainObject(obj) {
    if (!obj || toStr.call(obj) !== '[object Object]') {
      return false;
    }

    var hasOwnConstructor = hasOwn.call(obj, 'constructor');
    var hasIsPrototypeOf = obj.constructor && obj.constructor.prototype && hasOwn.call(obj.constructor.prototype, 'isPrototypeOf');
    // Not own constructor property must be Object
    if (obj.constructor && !hasOwnConstructor && !hasIsPrototypeOf) {
      return false;
    }

    // Own properties are enumerated firstly, so to speed up,
    // if last one is own, then all properties are own.
    var key;
    for (key in obj) { /**/ }

    return typeof key === 'undefined' || hasOwn.call(obj, key);
  };

  // If name is '__proto__', and Object.defineProperty is available, define __proto__ as an own property on target
  var setProperty = function setProperty(target, options) {
    if (defineProperty && options.name === '__proto__') {
      defineProperty(target, options.name, {
        enumerable: true,
        configurable: true,
        value: options.newValue,
        writable: true
      });
    } else {
      target[options.name] = options.newValue;
    }
  };

  // Return undefined instead of __proto__ if '__proto__' is not an own property
  var getProperty = function getProperty(obj, name) {
    if (name === '__proto__') {
      if (!hasOwn.call(obj, name)) {
        return void 0;
      } else if (gOPD) {
        // In early versions of node, obj['__proto__'] is buggy when obj has
        // __proto__ as an own property. Object.getOwnPropertyDescriptor() works.
        return gOPD(obj, name).value;
      }
    }

    return obj[name];
  };

  module.exports = function extend() {
    var options, name, src, copy, copyIsArray, clone;
    var target = arguments[0];
    var i = 1;
    var length = arguments.length;
    var deep = false;

    // Handle a deep copy situation
    if (typeof target === 'boolean') {
      deep = target;
      target = arguments[1] || {};
      // skip the boolean and the target
      i = 2;
    }
    if (target == null || (typeof target !== 'object' && typeof target !== 'function')) {
      target = {};
    }

    for (; i < length; ++i) {
      options = arguments[i];
      // Only deal with non-null/undefined values
      if (options != null) {
        // Extend the base object
        for (name in options) {
          src = getProperty(target, name);
          copy = getProperty(options, name);

          // Prevent never-ending loop
          if (target !== copy) {
            // Recurse if we're merging plain objects or arrays
            if (deep && copy && (isPlainObject(copy) || (copyIsArray = isArray(copy)))) {
              if (copyIsArray) {
                copyIsArray = false;
                clone = src && isArray(src) ? src : [];
              } else {
                clone = src && isPlainObject(src) ? src : {};
              }

              // Never move original objects, clone them
              setProperty(target, { name: name, newValue: extend(deep, clone, copy) });

            // Don't bring in undefined values
            } else if (typeof copy !== 'undefined') {
              setProperty(target, { name: name, newValue: copy });
            }
          }
        }
      }
    }

    // Return the modified object
    return target;
  };

  },{}],52:[function(require,module,exports){
  'use strict'

  var is = require('hast-util-is-element')

  module.exports = embedded

  var names = [
    'audio',
    'canvas',
    'embed',
    'iframe',
    'img',
    'math',
    'object',
    'picture',
    'svg',
    'video'
  ]

  function embedded(node) {
    return is(node, names)
  }

  },{"hast-util-is-element":55}],53:[function(require,module,exports){
  'use strict'

  var own = {}.hasOwnProperty

  module.exports = hasProperty

  // Check if `node` has a set `name` property.
  function hasProperty(node, name) {
    var props
    var value

    if (!node || !name || typeof node !== 'object' || node.type !== 'element') {
      return false
    }

    props = node.properties
    value = props && own.call(props, name) && props[name]

    return value !== null && value !== undefined && value !== false
  }

  },{}],54:[function(require,module,exports){
  /**
   * @fileoverview
   *   Check if a `link` element is “Body OK”.
   * @longdescription
   *   ## Usage
   *
   *   ```javascript
   *   var h = require('hastscript');
   *   var ok = require('hast-util-is-body-ok-link');
   *
   *   ok(h('link', {itemProp: 'foo'})); //=> true
   *   ok(h('link', {rel: ['stylesheet'], href: 'index.css'})); //=> true
   *   ok(h('link', {rel: ['author'], href: 'index.css'})); //=> false
   *   ```
   *
   *   ## API
   *
   *   ### `isBodyOkLink(node)`
   *
   *   * Return `true` for `link` elements with an `itemProp`
   *   * Return `true` for `link` elements with a `rel` list
   *     where one or more entries are `pingback`, `prefetch`,
   *     or `stylesheet`.
   */

  'use strict';

  var is = require('hast-util-is-element');
  var has = require('hast-util-has-property');

  module.exports = ok;

  var list = [
    'pingback',
    'prefetch',
    'stylesheet'
  ];

  function ok(node) {
    var length;
    var index;
    var rel;

    if (!is(node, 'link')) {
      return false;
    }

    if (has(node, 'itemProp')) {
      return true;
    }

    rel = (node.properties || {}).rel || [];
    length = rel.length;
    index = -1;

    if (rel.length === 0) {
      return false;
    }

    while (++index < length) {
      if (list.indexOf(rel[index]) === -1) {
        return false;
      }
    }

    return true;
  }

  },{"hast-util-has-property":53,"hast-util-is-element":55}],55:[function(require,module,exports){
  'use strict'

  module.exports = isElement

  // Check if if `node` is an `element` and, if `tagNames` is given, `node`
  // matches them `tagNames`.
  function isElement(node, tagNames) {
    var name

    if (
      !(
        tagNames === null ||
        tagNames === undefined ||
        typeof tagNames === 'string' ||
        (typeof tagNames === 'object' && tagNames.length !== 0)
      )
    ) {
      throw new Error(
        'Expected `string` or `Array.<string>` for `tagNames`, not `' +
          tagNames +
          '`'
      )
    }

    if (
      !node ||
      typeof node !== 'object' ||
      node.type !== 'element' ||
      typeof node.tagName !== 'string'
    ) {
      return false
    }

    if (tagNames === null || tagNames === undefined) {
      return true
    }

    name = node.tagName

    if (typeof tagNames === 'string') {
      return name === tagNames
    }

    return tagNames.indexOf(name) !== -1
  }

  },{}],56:[function(require,module,exports){
  'use strict'

  module.exports = parse

  var numberSign = 35 //  '#'
  var dot = 46 //  '.'

  // Create a hast element from a simple CSS selector.
  function parse(selector, defaultTagName) {
    var value = selector || ''
    var name = defaultTagName || 'div'
    var props = {}
    var index = -1
    var length = value.length
    var className
    var type
    var code
    var subvalue
    var lastIndex

    while (++index <= length) {
      code = value.charCodeAt(index)

      if (!code || code === dot || code === numberSign) {
        subvalue = value.slice(lastIndex, index)

        if (subvalue) {
          if (type === dot) {
            // eslint-disable-next-line max-depth
            if (className) {
              className.push(subvalue)
            } else {
              className = [subvalue]
              props.className = className
            }
          } else if (type === numberSign) {
            props.id = subvalue
          } else {
            name = subvalue
          }
        }

        lastIndex = index + 1
        type = code
      }
    }

    return {
      type: 'element',
      tagName: name,
      properties: props,
      children: []
    }
  }

  },{}],57:[function(require,module,exports){
  /**
   * @fileoverview
   *   Get the plain-text value of a HAST node.
   * @longdescription
   *   ## Usage
   *
   *   ```javascript
   *   var h = require('hastscript');
   *   var toString = require('hast-util-to-string');
   *
   *   toString(h('p', 'Alpha'));
   *   //=> 'Alpha'
   *   toString(h('div', [h('b', 'Bold'), ' and ', h('i', 'italic'), '.']));
   *   //=> 'Bold and italic.'
   *   ```
   *
   *   ## API
   *
   *   ### `toString(node)`
   *
   *   Transform a node to string.
   */

  'use strict';

  module.exports = toString;

  function toString(node) {
    /* “The concatenation of data of all the Text node descendants
     * of the context object, in tree order.” */
    if ('children' in node) {
      return all(node);
    }

    /* “Context object’s data.” */
    return 'value' in node ? node.value : '';
  }

  function one(node) {
    if (node.type === 'text') {
      return node.value;
    }

    return node.children ? all(node) : '';
  }

  function all(node) {
    var children = node.children;
    var length = children.length;
    var index = -1;
    var result = [];

    while (++index < length) {
      result[index] = one(children[index]);
    }

    return result.join('');
  }

  },{}],58:[function(require,module,exports){
  'use strict'

  module.exports = interElementWhiteSpace

  // HTML white-space expression.
  // See <https://html.spec.whatwg.org/#space-character>.
  var re = /[ \t\n\f\r]/g

  function interElementWhiteSpace(node) {
    var value

    if (node && typeof node === 'object' && node.type === 'text') {
      value = node.value || ''
    } else if (typeof node === 'string') {
      value = node
    } else {
      return false
    }

    return value.replace(re, '') === ''
  }

  },{}],59:[function(require,module,exports){
  module.exports=[
    // "area",
    // "base",
    // "basefont",
    // "bgsound",
    // "br",
    // "col",
    // "command",
    // "embed",
    // "frame",
    // "hr",
    // "image",
    // "img",
    // "input",
    // "isindex",
    // "keygen",
    // "link",
    // "menuitem",
    // "meta",
    // "nextid",
    // "param",
    // "source",
    // "track",
    // "wbr"
  ]

  },{}],60:[function(require,module,exports){
  module.exports=[
    "script",
    "style",
    "pre",
    "textarea"
  ]

  },{}],61:[function(require,module,exports){
  'use strict'

  module.exports = alphabetical

  // Check if the given character code, or the character code at the first
  // character, is alphabetical.
  function alphabetical(character) {
    var code = typeof character === 'string' ? character.charCodeAt(0) : character

    return (
      (code >= 97 && code <= 122) /* a-z */ ||
      (code >= 65 && code <= 90) /* A-Z */
    )
  }

  },{}],62:[function(require,module,exports){
  'use strict'

  var alphabetical = require('is-alphabetical')
  var decimal = require('is-decimal')

  module.exports = alphanumerical

  // Check if the given character code, or the character code at the first
  // character, is alphanumerical.
  function alphanumerical(character) {
    return alphabetical(character) || decimal(character)
  }

  },{"is-alphabetical":61,"is-decimal":64}],63:[function(require,module,exports){
  /*!
   * Determine if an object is a Buffer
   *
   * @author   Feross Aboukhadijeh <https://feross.org>
   * @license  MIT
   */

  module.exports = function isBuffer (obj) {
    return obj != null && obj.constructor != null &&
      typeof obj.constructor.isBuffer === 'function' && obj.constructor.isBuffer(obj)
  }

  },{}],64:[function(require,module,exports){
  'use strict'

  module.exports = decimal

  // Check if the given character code, or the character code at the first
  // character, is decimal.
  function decimal(character) {
    var code = typeof character === 'string' ? character.charCodeAt(0) : character

    return code >= 48 && code <= 57 /* 0-9 */
  }

  },{}],65:[function(require,module,exports){
  'use strict'

  module.exports = hexadecimal

  // Check if the given character code, or the character code at the first
  // character, is hexadecimal.
  function hexadecimal(character) {
    var code = typeof character === 'string' ? character.charCodeAt(0) : character

    return (
      (code >= 97 /* a */ && code <= 102) /* z */ ||
      (code >= 65 /* A */ && code <= 70) /* Z */ ||
      (code >= 48 /* A */ && code <= 57) /* Z */
    )
  }

  },{}],66:[function(require,module,exports){
  'use strict';
  var toString = Object.prototype.toString;

  module.exports = function (x) {
    var prototype;
    return toString.call(x) === '[object Object]' && (prototype = Object.getPrototypeOf(x), prototype === null || prototype === Object.getPrototypeOf({}));
  };

  },{}],67:[function(require,module,exports){
  (function (global){
  /**
   * lodash (Custom Build) <https://lodash.com/>
   * Build: `lodash modularize exports="npm" -o ./`
   * Copyright jQuery Foundation and other contributors <https://jquery.org/>
   * Released under MIT license <https://lodash.com/license>
   * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
   * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
   */

  /** Used as the size to enable large array optimizations. */
  var LARGE_ARRAY_SIZE = 200;

  /** Used as the `TypeError` message for "Functions" methods. */
  var FUNC_ERROR_TEXT = 'Expected a function';

  /** Used to stand-in for `undefined` hash values. */
  var HASH_UNDEFINED = '__lodash_hash_undefined__';

  /** Used to compose bitmasks for comparison styles. */
  var UNORDERED_COMPARE_FLAG = 1,
      PARTIAL_COMPARE_FLAG = 2;

  /** Used as references for various `Number` constants. */
  var INFINITY = 1 / 0,
      MAX_SAFE_INTEGER = 9007199254740991;

  /** `Object#toString` result references. */
  var argsTag = '[object Arguments]',
      arrayTag = '[object Array]',
      boolTag = '[object Boolean]',
      dateTag = '[object Date]',
      errorTag = '[object Error]',
      funcTag = '[object Function]',
      genTag = '[object GeneratorFunction]',
      mapTag = '[object Map]',
      numberTag = '[object Number]',
      objectTag = '[object Object]',
      promiseTag = '[object Promise]',
      regexpTag = '[object RegExp]',
      setTag = '[object Set]',
      stringTag = '[object String]',
      symbolTag = '[object Symbol]',
      weakMapTag = '[object WeakMap]';

  var arrayBufferTag = '[object ArrayBuffer]',
      dataViewTag = '[object DataView]',
      float32Tag = '[object Float32Array]',
      float64Tag = '[object Float64Array]',
      int8Tag = '[object Int8Array]',
      int16Tag = '[object Int16Array]',
      int32Tag = '[object Int32Array]',
      uint8Tag = '[object Uint8Array]',
      uint8ClampedTag = '[object Uint8ClampedArray]',
      uint16Tag = '[object Uint16Array]',
      uint32Tag = '[object Uint32Array]';

  /** Used to match property names within property paths. */
  var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
      reIsPlainProp = /^\w*$/,
      reLeadingDot = /^\./,
      rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

  /**
   * Used to match `RegExp`
   * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
   */
  var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

  /** Used to match backslashes in property paths. */
  var reEscapeChar = /\\(\\)?/g;

  /** Used to match `RegExp` flags from their coerced string values. */
  var reFlags = /\w*$/;

  /** Used to detect host constructors (Safari). */
  var reIsHostCtor = /^\[object .+?Constructor\]$/;

  /** Used to detect unsigned integer values. */
  var reIsUint = /^(?:0|[1-9]\d*)$/;

  /** Used to identify `toStringTag` values of typed arrays. */
  var typedArrayTags = {};
  typedArrayTags[float32Tag] = typedArrayTags[float64Tag] =
  typedArrayTags[int8Tag] = typedArrayTags[int16Tag] =
  typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] =
  typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] =
  typedArrayTags[uint32Tag] = true;
  typedArrayTags[argsTag] = typedArrayTags[arrayTag] =
  typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] =
  typedArrayTags[dataViewTag] = typedArrayTags[dateTag] =
  typedArrayTags[errorTag] = typedArrayTags[funcTag] =
  typedArrayTags[mapTag] = typedArrayTags[numberTag] =
  typedArrayTags[objectTag] = typedArrayTags[regexpTag] =
  typedArrayTags[setTag] = typedArrayTags[stringTag] =
  typedArrayTags[weakMapTag] = false;

  /** Used to identify `toStringTag` values supported by `_.clone`. */
  var cloneableTags = {};
  cloneableTags[argsTag] = cloneableTags[arrayTag] =
  cloneableTags[arrayBufferTag] = cloneableTags[dataViewTag] =
  cloneableTags[boolTag] = cloneableTags[dateTag] =
  cloneableTags[float32Tag] = cloneableTags[float64Tag] =
  cloneableTags[int8Tag] = cloneableTags[int16Tag] =
  cloneableTags[int32Tag] = cloneableTags[mapTag] =
  cloneableTags[numberTag] = cloneableTags[objectTag] =
  cloneableTags[regexpTag] = cloneableTags[setTag] =
  cloneableTags[stringTag] = cloneableTags[symbolTag] =
  cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] =
  cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
  cloneableTags[errorTag] = cloneableTags[funcTag] =
  cloneableTags[weakMapTag] = false;

  /** Detect free variable `global` from Node.js. */
  var freeGlobal = typeof global == 'object' && global && global.Object === Object && global;

  /** Detect free variable `self`. */
  var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

  /** Used as a reference to the global object. */
  var root = freeGlobal || freeSelf || Function('return this')();

  /** Detect free variable `exports`. */
  var freeExports = typeof exports == 'object' && exports && !exports.nodeType && exports;

  /** Detect free variable `module`. */
  var freeModule = freeExports && typeof module == 'object' && module && !module.nodeType && module;

  /** Detect the popular CommonJS extension `module.exports`. */
  var moduleExports = freeModule && freeModule.exports === freeExports;

  /** Detect free variable `process` from Node.js. */
  var freeProcess = moduleExports && freeGlobal.process;

  /** Used to access faster Node.js helpers. */
  var nodeUtil = (function() {
    try {
      return freeProcess && freeProcess.binding('util');
    } catch (e) {}
  }());

  /* Node.js helper references. */
  var nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;

  /**
   * Adds the key-value `pair` to `map`.
   *
   * @private
   * @param {Object} map The map to modify.
   * @param {Array} pair The key-value pair to add.
   * @returns {Object} Returns `map`.
   */
  function addMapEntry(map, pair) {
    // Don't return `map.set` because it's not chainable in IE 11.
    map.set(pair[0], pair[1]);
    return map;
  }

  /**
   * Adds `value` to `set`.
   *
   * @private
   * @param {Object} set The set to modify.
   * @param {*} value The value to add.
   * @returns {Object} Returns `set`.
   */
  function addSetEntry(set, value) {
    // Don't return `set.add` because it's not chainable in IE 11.
    set.add(value);
    return set;
  }

  /**
   * A specialized version of `_.forEach` for arrays without support for
   * iteratee shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array} Returns `array`.
   */
  function arrayEach(array, iteratee) {
    var index = -1,
        length = array ? array.length : 0;

    while (++index < length) {
      if (iteratee(array[index], index, array) === false) {
        break;
      }
    }
    return array;
  }

  /**
   * Appends the elements of `values` to `array`.
   *
   * @private
   * @param {Array} array The array to modify.
   * @param {Array} values The values to append.
   * @returns {Array} Returns `array`.
   */
  function arrayPush(array, values) {
    var index = -1,
        length = values.length,
        offset = array.length;

    while (++index < length) {
      array[offset + index] = values[index];
    }
    return array;
  }

  /**
   * A specialized version of `_.reduce` for arrays without support for
   * iteratee shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} iteratee The function invoked per iteration.
   * @param {*} [accumulator] The initial value.
   * @param {boolean} [initAccum] Specify using the first element of `array` as
   *  the initial value.
   * @returns {*} Returns the accumulated value.
   */
  function arrayReduce(array, iteratee, accumulator, initAccum) {
    var index = -1,
        length = array ? array.length : 0;

    if (initAccum && length) {
      accumulator = array[++index];
    }
    while (++index < length) {
      accumulator = iteratee(accumulator, array[index], index, array);
    }
    return accumulator;
  }

  /**
   * A specialized version of `_.some` for arrays without support for iteratee
   * shorthands.
   *
   * @private
   * @param {Array} [array] The array to iterate over.
   * @param {Function} predicate The function invoked per iteration.
   * @returns {boolean} Returns `true` if any element passes the predicate check,
   *  else `false`.
   */
  function arraySome(array, predicate) {
    var index = -1,
        length = array ? array.length : 0;

    while (++index < length) {
      if (predicate(array[index], index, array)) {
        return true;
      }
    }
    return false;
  }

  /**
   * The base implementation of `_.property` without support for deep paths.
   *
   * @private
   * @param {string} key The key of the property to get.
   * @returns {Function} Returns the new accessor function.
   */
  function baseProperty(key) {
    return function(object) {
      return object == null ? undefined : object[key];
    };
  }

  /**
   * The base implementation of `_.times` without support for iteratee shorthands
   * or max array length checks.
   *
   * @private
   * @param {number} n The number of times to invoke `iteratee`.
   * @param {Function} iteratee The function invoked per iteration.
   * @returns {Array} Returns the array of results.
   */
  function baseTimes(n, iteratee) {
    var index = -1,
        result = Array(n);

    while (++index < n) {
      result[index] = iteratee(index);
    }
    return result;
  }

  /**
   * The base implementation of `_.unary` without support for storing metadata.
   *
   * @private
   * @param {Function} func The function to cap arguments for.
   * @returns {Function} Returns the new capped function.
   */
  function baseUnary(func) {
    return function(value) {
      return func(value);
    };
  }

  /**
   * Gets the value at `key` of `object`.
   *
   * @private
   * @param {Object} [object] The object to query.
   * @param {string} key The key of the property to get.
   * @returns {*} Returns the property value.
   */
  function getValue(object, key) {
    return object == null ? undefined : object[key];
  }

  /**
   * Checks if `value` is a host object in IE < 9.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a host object, else `false`.
   */
  function isHostObject(value) {
    // Many host objects are `Object` objects that can coerce to strings
    // despite having improperly defined `toString` methods.
    var result = false;
    if (value != null && typeof value.toString != 'function') {
      try {
        result = !!(value + '');
      } catch (e) {}
    }
    return result;
  }

  /**
   * Converts `map` to its key-value pairs.
   *
   * @private
   * @param {Object} map The map to convert.
   * @returns {Array} Returns the key-value pairs.
   */
  function mapToArray(map) {
    var index = -1,
        result = Array(map.size);

    map.forEach(function(value, key) {
      result[++index] = [key, value];
    });
    return result;
  }

  /**
   * Creates a unary function that invokes `func` with its argument transformed.
   *
   * @private
   * @param {Function} func The function to wrap.
   * @param {Function} transform The argument transform.
   * @returns {Function} Returns the new function.
   */
  function overArg(func, transform) {
    return function(arg) {
      return func(transform(arg));
    };
  }

  /**
   * Converts `set` to an array of its values.
   *
   * @private
   * @param {Object} set The set to convert.
   * @returns {Array} Returns the values.
   */
  function setToArray(set) {
    var index = -1,
        result = Array(set.size);

    set.forEach(function(value) {
      result[++index] = value;
    });
    return result;
  }

  /** Used for built-in method references. */
  var arrayProto = Array.prototype,
      funcProto = Function.prototype,
      objectProto = Object.prototype;

  /** Used to detect overreaching core-js shims. */
  var coreJsData = root['__core-js_shared__'];

  /** Used to detect methods masquerading as native. */
  var maskSrcKey = (function() {
    var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || '');
    return uid ? ('Symbol(src)_1.' + uid) : '';
  }());

  /** Used to resolve the decompiled source of functions. */
  var funcToString = funcProto.toString;

  /** Used to check objects for own properties. */
  var hasOwnProperty = objectProto.hasOwnProperty;

  /**
   * Used to resolve the
   * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
   * of values.
   */
  var objectToString = objectProto.toString;

  /** Used to detect if a method is native. */
  var reIsNative = RegExp('^' +
    funcToString.call(hasOwnProperty).replace(reRegExpChar, '\\$&')
    .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
  );

  /** Built-in value references. */
  var Buffer = moduleExports ? root.Buffer : undefined,
      Symbol = root.Symbol,
      Uint8Array = root.Uint8Array,
      getPrototype = overArg(Object.getPrototypeOf, Object),
      objectCreate = Object.create,
      propertyIsEnumerable = objectProto.propertyIsEnumerable,
      splice = arrayProto.splice;

  /* Built-in method references for those with the same name as other `lodash` methods. */
  var nativeGetSymbols = Object.getOwnPropertySymbols,
      nativeIsBuffer = Buffer ? Buffer.isBuffer : undefined,
      nativeKeys = overArg(Object.keys, Object);

  /* Built-in method references that are verified to be native. */
  var DataView = getNative(root, 'DataView'),
      Map = getNative(root, 'Map'),
      Promise = getNative(root, 'Promise'),
      Set = getNative(root, 'Set'),
      WeakMap = getNative(root, 'WeakMap'),
      nativeCreate = getNative(Object, 'create');

  /** Used to detect maps, sets, and weakmaps. */
  var dataViewCtorString = toSource(DataView),
      mapCtorString = toSource(Map),
      promiseCtorString = toSource(Promise),
      setCtorString = toSource(Set),
      weakMapCtorString = toSource(WeakMap);

  /** Used to convert symbols to primitives and strings. */
  var symbolProto = Symbol ? Symbol.prototype : undefined,
      symbolValueOf = symbolProto ? symbolProto.valueOf : undefined,
      symbolToString = symbolProto ? symbolProto.toString : undefined;

  /**
   * Creates a hash object.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function Hash(entries) {
    var index = -1,
        length = entries ? entries.length : 0;

    this.clear();
    while (++index < length) {
      var entry = entries[index];
      this.set(entry[0], entry[1]);
    }
  }

  /**
   * Removes all key-value entries from the hash.
   *
   * @private
   * @name clear
   * @memberOf Hash
   */
  function hashClear() {
    this.__data__ = nativeCreate ? nativeCreate(null) : {};
  }

  /**
   * Removes `key` and its value from the hash.
   *
   * @private
   * @name delete
   * @memberOf Hash
   * @param {Object} hash The hash to modify.
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function hashDelete(key) {
    return this.has(key) && delete this.__data__[key];
  }

  /**
   * Gets the hash value for `key`.
   *
   * @private
   * @name get
   * @memberOf Hash
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function hashGet(key) {
    var data = this.__data__;
    if (nativeCreate) {
      var result = data[key];
      return result === HASH_UNDEFINED ? undefined : result;
    }
    return hasOwnProperty.call(data, key) ? data[key] : undefined;
  }

  /**
   * Checks if a hash value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf Hash
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function hashHas(key) {
    var data = this.__data__;
    return nativeCreate ? data[key] !== undefined : hasOwnProperty.call(data, key);
  }

  /**
   * Sets the hash `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf Hash
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the hash instance.
   */
  function hashSet(key, value) {
    var data = this.__data__;
    data[key] = (nativeCreate && value === undefined) ? HASH_UNDEFINED : value;
    return this;
  }

  // Add methods to `Hash`.
  Hash.prototype.clear = hashClear;
  Hash.prototype['delete'] = hashDelete;
  Hash.prototype.get = hashGet;
  Hash.prototype.has = hashHas;
  Hash.prototype.set = hashSet;

  /**
   * Creates an list cache object.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function ListCache(entries) {
    var index = -1,
        length = entries ? entries.length : 0;

    this.clear();
    while (++index < length) {
      var entry = entries[index];
      this.set(entry[0], entry[1]);
    }
  }

  /**
   * Removes all key-value entries from the list cache.
   *
   * @private
   * @name clear
   * @memberOf ListCache
   */
  function listCacheClear() {
    this.__data__ = [];
  }

  /**
   * Removes `key` and its value from the list cache.
   *
   * @private
   * @name delete
   * @memberOf ListCache
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function listCacheDelete(key) {
    var data = this.__data__,
        index = assocIndexOf(data, key);

    if (index < 0) {
      return false;
    }
    var lastIndex = data.length - 1;
    if (index == lastIndex) {
      data.pop();
    } else {
      splice.call(data, index, 1);
    }
    return true;
  }

  /**
   * Gets the list cache value for `key`.
   *
   * @private
   * @name get
   * @memberOf ListCache
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function listCacheGet(key) {
    var data = this.__data__,
        index = assocIndexOf(data, key);

    return index < 0 ? undefined : data[index][1];
  }

  /**
   * Checks if a list cache value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf ListCache
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function listCacheHas(key) {
    return assocIndexOf(this.__data__, key) > -1;
  }

  /**
   * Sets the list cache `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf ListCache
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the list cache instance.
   */
  function listCacheSet(key, value) {
    var data = this.__data__,
        index = assocIndexOf(data, key);

    if (index < 0) {
      data.push([key, value]);
    } else {
      data[index][1] = value;
    }
    return this;
  }

  // Add methods to `ListCache`.
  ListCache.prototype.clear = listCacheClear;
  ListCache.prototype['delete'] = listCacheDelete;
  ListCache.prototype.get = listCacheGet;
  ListCache.prototype.has = listCacheHas;
  ListCache.prototype.set = listCacheSet;

  /**
   * Creates a map cache object to store key-value pairs.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function MapCache(entries) {
    var index = -1,
        length = entries ? entries.length : 0;

    this.clear();
    while (++index < length) {
      var entry = entries[index];
      this.set(entry[0], entry[1]);
    }
  }

  /**
   * Removes all key-value entries from the map.
   *
   * @private
   * @name clear
   * @memberOf MapCache
   */
  function mapCacheClear() {
    this.__data__ = {
      'hash': new Hash,
      'map': new (Map || ListCache),
      'string': new Hash
    };
  }

  /**
   * Removes `key` and its value from the map.
   *
   * @private
   * @name delete
   * @memberOf MapCache
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function mapCacheDelete(key) {
    return getMapData(this, key)['delete'](key);
  }

  /**
   * Gets the map value for `key`.
   *
   * @private
   * @name get
   * @memberOf MapCache
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function mapCacheGet(key) {
    return getMapData(this, key).get(key);
  }

  /**
   * Checks if a map value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf MapCache
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function mapCacheHas(key) {
    return getMapData(this, key).has(key);
  }

  /**
   * Sets the map `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf MapCache
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the map cache instance.
   */
  function mapCacheSet(key, value) {
    getMapData(this, key).set(key, value);
    return this;
  }

  // Add methods to `MapCache`.
  MapCache.prototype.clear = mapCacheClear;
  MapCache.prototype['delete'] = mapCacheDelete;
  MapCache.prototype.get = mapCacheGet;
  MapCache.prototype.has = mapCacheHas;
  MapCache.prototype.set = mapCacheSet;

  /**
   *
   * Creates an array cache object to store unique values.
   *
   * @private
   * @constructor
   * @param {Array} [values] The values to cache.
   */
  function SetCache(values) {
    var index = -1,
        length = values ? values.length : 0;

    this.__data__ = new MapCache;
    while (++index < length) {
      this.add(values[index]);
    }
  }

  /**
   * Adds `value` to the array cache.
   *
   * @private
   * @name add
   * @memberOf SetCache
   * @alias push
   * @param {*} value The value to cache.
   * @returns {Object} Returns the cache instance.
   */
  function setCacheAdd(value) {
    this.__data__.set(value, HASH_UNDEFINED);
    return this;
  }

  /**
   * Checks if `value` is in the array cache.
   *
   * @private
   * @name has
   * @memberOf SetCache
   * @param {*} value The value to search for.
   * @returns {number} Returns `true` if `value` is found, else `false`.
   */
  function setCacheHas(value) {
    return this.__data__.has(value);
  }

  // Add methods to `SetCache`.
  SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
  SetCache.prototype.has = setCacheHas;

  /**
   * Creates a stack cache object to store key-value pairs.
   *
   * @private
   * @constructor
   * @param {Array} [entries] The key-value pairs to cache.
   */
  function Stack(entries) {
    this.__data__ = new ListCache(entries);
  }

  /**
   * Removes all key-value entries from the stack.
   *
   * @private
   * @name clear
   * @memberOf Stack
   */
  function stackClear() {
    this.__data__ = new ListCache;
  }

  /**
   * Removes `key` and its value from the stack.
   *
   * @private
   * @name delete
   * @memberOf Stack
   * @param {string} key The key of the value to remove.
   * @returns {boolean} Returns `true` if the entry was removed, else `false`.
   */
  function stackDelete(key) {
    return this.__data__['delete'](key);
  }

  /**
   * Gets the stack value for `key`.
   *
   * @private
   * @name get
   * @memberOf Stack
   * @param {string} key The key of the value to get.
   * @returns {*} Returns the entry value.
   */
  function stackGet(key) {
    return this.__data__.get(key);
  }

  /**
   * Checks if a stack value for `key` exists.
   *
   * @private
   * @name has
   * @memberOf Stack
   * @param {string} key The key of the entry to check.
   * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
   */
  function stackHas(key) {
    return this.__data__.has(key);
  }

  /**
   * Sets the stack `key` to `value`.
   *
   * @private
   * @name set
   * @memberOf Stack
   * @param {string} key The key of the value to set.
   * @param {*} value The value to set.
   * @returns {Object} Returns the stack cache instance.
   */
  function stackSet(key, value) {
    var cache = this.__data__;
    if (cache instanceof ListCache) {
      var pairs = cache.__data__;
      if (!Map || (pairs.length < LARGE_ARRAY_SIZE - 1)) {
        pairs.push([key, value]);
        return this;
      }
      cache = this.__data__ = new MapCache(pairs);
    }
    cache.set(key, value);
    return this;
  }

  // Add methods to `Stack`.
  Stack.prototype.clear = stackClear;
  Stack.prototype['delete'] = stackDelete;
  Stack.prototype.get = stackGet;
  Stack.prototype.has = stackHas;
  Stack.prototype.set = stackSet;

  /**
   * Creates an array of the enumerable property names of the array-like `value`.
   *
   * @private
   * @param {*} value The value to query.
   * @param {boolean} inherited Specify returning inherited property names.
   * @returns {Array} Returns the array of property names.
   */
  function arrayLikeKeys(value, inherited) {
    // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
    // Safari 9 makes `arguments.length` enumerable in strict mode.
    var result = (isArray(value) || isArguments(value))
      ? baseTimes(value.length, String)
      : [];

    var length = result.length,
        skipIndexes = !!length;

    for (var key in value) {
      if ((inherited || hasOwnProperty.call(value, key)) &&
          !(skipIndexes && (key == 'length' || isIndex(key, length)))) {
        result.push(key);
      }
    }
    return result;
  }

  /**
   * Assigns `value` to `key` of `object` if the existing value is not equivalent
   * using [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
   * for equality comparisons.
   *
   * @private
   * @param {Object} object The object to modify.
   * @param {string} key The key of the property to assign.
   * @param {*} value The value to assign.
   */
  function assignValue(object, key, value) {
    var objValue = object[key];
    if (!(hasOwnProperty.call(object, key) && eq(objValue, value)) ||
        (value === undefined && !(key in object))) {
      object[key] = value;
    }
  }

  /**
   * Gets the index at which the `key` is found in `array` of key-value pairs.
   *
   * @private
   * @param {Array} array The array to inspect.
   * @param {*} key The key to search for.
   * @returns {number} Returns the index of the matched value, else `-1`.
   */
  function assocIndexOf(array, key) {
    var length = array.length;
    while (length--) {
      if (eq(array[length][0], key)) {
        return length;
      }
    }
    return -1;
  }

  /**
   * The base implementation of `_.assign` without support for multiple sources
   * or `customizer` functions.
   *
   * @private
   * @param {Object} object The destination object.
   * @param {Object} source The source object.
   * @returns {Object} Returns `object`.
   */
  function baseAssign(object, source) {
    return object && copyObject(source, keys(source), object);
  }

  /**
   * The base implementation of `_.clone` and `_.cloneDeep` which tracks
   * traversed objects.
   *
   * @private
   * @param {*} value The value to clone.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @param {boolean} [isFull] Specify a clone including symbols.
   * @param {Function} [customizer] The function to customize cloning.
   * @param {string} [key] The key of `value`.
   * @param {Object} [object] The parent object of `value`.
   * @param {Object} [stack] Tracks traversed objects and their clone counterparts.
   * @returns {*} Returns the cloned value.
   */
  function baseClone(value, isDeep, isFull, customizer, key, object, stack) {
    var result;
    if (customizer) {
      result = object ? customizer(value, key, object, stack) : customizer(value);
    }
    if (result !== undefined) {
      return result;
    }
    if (!isObject(value)) {
      return value;
    }
    var isArr = isArray(value);
    if (isArr) {
      result = initCloneArray(value);
      if (!isDeep) {
        return copyArray(value, result);
      }
    } else {
      var tag = getTag(value),
          isFunc = tag == funcTag || tag == genTag;

      if (isBuffer(value)) {
        return cloneBuffer(value, isDeep);
      }
      if (tag == objectTag || tag == argsTag || (isFunc && !object)) {
        if (isHostObject(value)) {
          return object ? value : {};
        }
        result = initCloneObject(isFunc ? {} : value);
        if (!isDeep) {
          return copySymbols(value, baseAssign(result, value));
        }
      } else {
        if (!cloneableTags[tag]) {
          return object ? value : {};
        }
        result = initCloneByTag(value, tag, baseClone, isDeep);
      }
    }
    // Check for circular references and return its corresponding clone.
    stack || (stack = new Stack);
    var stacked = stack.get(value);
    if (stacked) {
      return stacked;
    }
    stack.set(value, result);

    if (!isArr) {
      var props = isFull ? getAllKeys(value) : keys(value);
    }
    arrayEach(props || value, function(subValue, key) {
      if (props) {
        key = subValue;
        subValue = value[key];
      }
      // Recursively populate clone (susceptible to call stack limits).
      assignValue(result, key, baseClone(subValue, isDeep, isFull, customizer, key, value, stack));
    });
    return result;
  }

  /**
   * The base implementation of `_.create` without support for assigning
   * properties to the created object.
   *
   * @private
   * @param {Object} prototype The object to inherit from.
   * @returns {Object} Returns the new object.
   */
  function baseCreate(proto) {
    return isObject(proto) ? objectCreate(proto) : {};
  }

  /**
   * The base implementation of `_.get` without support for default values.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Array|string} path The path of the property to get.
   * @returns {*} Returns the resolved value.
   */
  function baseGet(object, path) {
    path = isKey(path, object) ? [path] : castPath(path);

    var index = 0,
        length = path.length;

    while (object != null && index < length) {
      object = object[toKey(path[index++])];
    }
    return (index && index == length) ? object : undefined;
  }

  /**
   * The base implementation of `getAllKeys` and `getAllKeysIn` which uses
   * `keysFunc` and `symbolsFunc` to get the enumerable property names and
   * symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Function} keysFunc The function to get the keys of `object`.
   * @param {Function} symbolsFunc The function to get the symbols of `object`.
   * @returns {Array} Returns the array of property names and symbols.
   */
  function baseGetAllKeys(object, keysFunc, symbolsFunc) {
    var result = keysFunc(object);
    return isArray(object) ? result : arrayPush(result, symbolsFunc(object));
  }

  /**
   * The base implementation of `getTag`.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the `toStringTag`.
   */
  function baseGetTag(value) {
    return objectToString.call(value);
  }

  /**
   * The base implementation of `_.hasIn` without support for deep paths.
   *
   * @private
   * @param {Object} [object] The object to query.
   * @param {Array|string} key The key to check.
   * @returns {boolean} Returns `true` if `key` exists, else `false`.
   */
  function baseHasIn(object, key) {
    return object != null && key in Object(object);
  }

  /**
   * The base implementation of `_.isEqual` which supports partial comparisons
   * and tracks traversed objects.
   *
   * @private
   * @param {*} value The value to compare.
   * @param {*} other The other value to compare.
   * @param {Function} [customizer] The function to customize comparisons.
   * @param {boolean} [bitmask] The bitmask of comparison flags.
   *  The bitmask may be composed of the following flags:
   *     1 - Unordered comparison
   *     2 - Partial comparison
   * @param {Object} [stack] Tracks traversed `value` and `other` objects.
   * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
   */
  function baseIsEqual(value, other, customizer, bitmask, stack) {
    if (value === other) {
      return true;
    }
    if (value == null || other == null || (!isObject(value) && !isObjectLike(other))) {
      return value !== value && other !== other;
    }
    return baseIsEqualDeep(value, other, baseIsEqual, customizer, bitmask, stack);
  }

  /**
   * A specialized version of `baseIsEqual` for arrays and objects which performs
   * deep comparisons and tracks traversed objects enabling objects with circular
   * references to be compared.
   *
   * @private
   * @param {Object} object The object to compare.
   * @param {Object} other The other object to compare.
   * @param {Function} equalFunc The function to determine equivalents of values.
   * @param {Function} [customizer] The function to customize comparisons.
   * @param {number} [bitmask] The bitmask of comparison flags. See `baseIsEqual`
   *  for more details.
   * @param {Object} [stack] Tracks traversed `object` and `other` objects.
   * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
   */
  function baseIsEqualDeep(object, other, equalFunc, customizer, bitmask, stack) {
    var objIsArr = isArray(object),
        othIsArr = isArray(other),
        objTag = arrayTag,
        othTag = arrayTag;

    if (!objIsArr) {
      objTag = getTag(object);
      objTag = objTag == argsTag ? objectTag : objTag;
    }
    if (!othIsArr) {
      othTag = getTag(other);
      othTag = othTag == argsTag ? objectTag : othTag;
    }
    var objIsObj = objTag == objectTag && !isHostObject(object),
        othIsObj = othTag == objectTag && !isHostObject(other),
        isSameTag = objTag == othTag;

    if (isSameTag && !objIsObj) {
      stack || (stack = new Stack);
      return (objIsArr || isTypedArray(object))
        ? equalArrays(object, other, equalFunc, customizer, bitmask, stack)
        : equalByTag(object, other, objTag, equalFunc, customizer, bitmask, stack);
    }
    if (!(bitmask & PARTIAL_COMPARE_FLAG)) {
      var objIsWrapped = objIsObj && hasOwnProperty.call(object, '__wrapped__'),
          othIsWrapped = othIsObj && hasOwnProperty.call(other, '__wrapped__');

      if (objIsWrapped || othIsWrapped) {
        var objUnwrapped = objIsWrapped ? object.value() : object,
            othUnwrapped = othIsWrapped ? other.value() : other;

        stack || (stack = new Stack);
        return equalFunc(objUnwrapped, othUnwrapped, customizer, bitmask, stack);
      }
    }
    if (!isSameTag) {
      return false;
    }
    stack || (stack = new Stack);
    return equalObjects(object, other, equalFunc, customizer, bitmask, stack);
  }

  /**
   * The base implementation of `_.isMatch` without support for iteratee shorthands.
   *
   * @private
   * @param {Object} object The object to inspect.
   * @param {Object} source The object of property values to match.
   * @param {Array} matchData The property names, values, and compare flags to match.
   * @param {Function} [customizer] The function to customize comparisons.
   * @returns {boolean} Returns `true` if `object` is a match, else `false`.
   */
  function baseIsMatch(object, source, matchData, customizer) {
    var index = matchData.length,
        length = index,
        noCustomizer = !customizer;

    if (object == null) {
      return !length;
    }
    object = Object(object);
    while (index--) {
      var data = matchData[index];
      if ((noCustomizer && data[2])
            ? data[1] !== object[data[0]]
            : !(data[0] in object)
          ) {
        return false;
      }
    }
    while (++index < length) {
      data = matchData[index];
      var key = data[0],
          objValue = object[key],
          srcValue = data[1];

      if (noCustomizer && data[2]) {
        if (objValue === undefined && !(key in object)) {
          return false;
        }
      } else {
        var stack = new Stack;
        if (customizer) {
          var result = customizer(objValue, srcValue, key, object, source, stack);
        }
        if (!(result === undefined
              ? baseIsEqual(srcValue, objValue, customizer, UNORDERED_COMPARE_FLAG | PARTIAL_COMPARE_FLAG, stack)
              : result
            )) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * The base implementation of `_.isNative` without bad shim checks.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a native function,
   *  else `false`.
   */
  function baseIsNative(value) {
    if (!isObject(value) || isMasked(value)) {
      return false;
    }
    var pattern = (isFunction(value) || isHostObject(value)) ? reIsNative : reIsHostCtor;
    return pattern.test(toSource(value));
  }

  /**
   * The base implementation of `_.isTypedArray` without Node.js optimizations.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
   */
  function baseIsTypedArray(value) {
    return isObjectLike(value) &&
      isLength(value.length) && !!typedArrayTags[objectToString.call(value)];
  }

  /**
   * The base implementation of `_.iteratee`.
   *
   * @private
   * @param {*} [value=_.identity] The value to convert to an iteratee.
   * @returns {Function} Returns the iteratee.
   */
  function baseIteratee(value) {
    // Don't store the `typeof` result in a variable to avoid a JIT bug in Safari 9.
    // See https://bugs.webkit.org/show_bug.cgi?id=156034 for more details.
    if (typeof value == 'function') {
      return value;
    }
    if (value == null) {
      return identity;
    }
    if (typeof value == 'object') {
      return isArray(value)
        ? baseMatchesProperty(value[0], value[1])
        : baseMatches(value);
    }
    return property(value);
  }

  /**
   * The base implementation of `_.keys` which doesn't treat sparse arrays as dense.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   */
  function baseKeys(object) {
    if (!isPrototype(object)) {
      return nativeKeys(object);
    }
    var result = [];
    for (var key in Object(object)) {
      if (hasOwnProperty.call(object, key) && key != 'constructor') {
        result.push(key);
      }
    }
    return result;
  }

  /**
   * The base implementation of `_.matches` which doesn't clone `source`.
   *
   * @private
   * @param {Object} source The object of property values to match.
   * @returns {Function} Returns the new spec function.
   */
  function baseMatches(source) {
    var matchData = getMatchData(source);
    if (matchData.length == 1 && matchData[0][2]) {
      return matchesStrictComparable(matchData[0][0], matchData[0][1]);
    }
    return function(object) {
      return object === source || baseIsMatch(object, source, matchData);
    };
  }

  /**
   * The base implementation of `_.matchesProperty` which doesn't clone `srcValue`.
   *
   * @private
   * @param {string} path The path of the property to get.
   * @param {*} srcValue The value to match.
   * @returns {Function} Returns the new spec function.
   */
  function baseMatchesProperty(path, srcValue) {
    if (isKey(path) && isStrictComparable(srcValue)) {
      return matchesStrictComparable(toKey(path), srcValue);
    }
    return function(object) {
      var objValue = get(object, path);
      return (objValue === undefined && objValue === srcValue)
        ? hasIn(object, path)
        : baseIsEqual(srcValue, objValue, undefined, UNORDERED_COMPARE_FLAG | PARTIAL_COMPARE_FLAG);
    };
  }

  /**
   * A specialized version of `baseProperty` which supports deep paths.
   *
   * @private
   * @param {Array|string} path The path of the property to get.
   * @returns {Function} Returns the new accessor function.
   */
  function basePropertyDeep(path) {
    return function(object) {
      return baseGet(object, path);
    };
  }

  /**
   * The base implementation of `_.toString` which doesn't convert nullish
   * values to empty strings.
   *
   * @private
   * @param {*} value The value to process.
   * @returns {string} Returns the string.
   */
  function baseToString(value) {
    // Exit early for strings to avoid a performance hit in some environments.
    if (typeof value == 'string') {
      return value;
    }
    if (isSymbol(value)) {
      return symbolToString ? symbolToString.call(value) : '';
    }
    var result = (value + '');
    return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
  }

  /**
   * Casts `value` to a path array if it's not one.
   *
   * @private
   * @param {*} value The value to inspect.
   * @returns {Array} Returns the cast property path array.
   */
  function castPath(value) {
    return isArray(value) ? value : stringToPath(value);
  }

  /**
   * Creates a clone of  `buffer`.
   *
   * @private
   * @param {Buffer} buffer The buffer to clone.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @returns {Buffer} Returns the cloned buffer.
   */
  function cloneBuffer(buffer, isDeep) {
    if (isDeep) {
      return buffer.slice();
    }
    var result = new buffer.constructor(buffer.length);
    buffer.copy(result);
    return result;
  }

  /**
   * Creates a clone of `arrayBuffer`.
   *
   * @private
   * @param {ArrayBuffer} arrayBuffer The array buffer to clone.
   * @returns {ArrayBuffer} Returns the cloned array buffer.
   */
  function cloneArrayBuffer(arrayBuffer) {
    var result = new arrayBuffer.constructor(arrayBuffer.byteLength);
    new Uint8Array(result).set(new Uint8Array(arrayBuffer));
    return result;
  }

  /**
   * Creates a clone of `dataView`.
   *
   * @private
   * @param {Object} dataView The data view to clone.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @returns {Object} Returns the cloned data view.
   */
  function cloneDataView(dataView, isDeep) {
    var buffer = isDeep ? cloneArrayBuffer(dataView.buffer) : dataView.buffer;
    return new dataView.constructor(buffer, dataView.byteOffset, dataView.byteLength);
  }

  /**
   * Creates a clone of `map`.
   *
   * @private
   * @param {Object} map The map to clone.
   * @param {Function} cloneFunc The function to clone values.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @returns {Object} Returns the cloned map.
   */
  function cloneMap(map, isDeep, cloneFunc) {
    var array = isDeep ? cloneFunc(mapToArray(map), true) : mapToArray(map);
    return arrayReduce(array, addMapEntry, new map.constructor);
  }

  /**
   * Creates a clone of `regexp`.
   *
   * @private
   * @param {Object} regexp The regexp to clone.
   * @returns {Object} Returns the cloned regexp.
   */
  function cloneRegExp(regexp) {
    var result = new regexp.constructor(regexp.source, reFlags.exec(regexp));
    result.lastIndex = regexp.lastIndex;
    return result;
  }

  /**
   * Creates a clone of `set`.
   *
   * @private
   * @param {Object} set The set to clone.
   * @param {Function} cloneFunc The function to clone values.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @returns {Object} Returns the cloned set.
   */
  function cloneSet(set, isDeep, cloneFunc) {
    var array = isDeep ? cloneFunc(setToArray(set), true) : setToArray(set);
    return arrayReduce(array, addSetEntry, new set.constructor);
  }

  /**
   * Creates a clone of the `symbol` object.
   *
   * @private
   * @param {Object} symbol The symbol object to clone.
   * @returns {Object} Returns the cloned symbol object.
   */
  function cloneSymbol(symbol) {
    return symbolValueOf ? Object(symbolValueOf.call(symbol)) : {};
  }

  /**
   * Creates a clone of `typedArray`.
   *
   * @private
   * @param {Object} typedArray The typed array to clone.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @returns {Object} Returns the cloned typed array.
   */
  function cloneTypedArray(typedArray, isDeep) {
    var buffer = isDeep ? cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
    return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
  }

  /**
   * Copies the values of `source` to `array`.
   *
   * @private
   * @param {Array} source The array to copy values from.
   * @param {Array} [array=[]] The array to copy values to.
   * @returns {Array} Returns `array`.
   */
  function copyArray(source, array) {
    var index = -1,
        length = source.length;

    array || (array = Array(length));
    while (++index < length) {
      array[index] = source[index];
    }
    return array;
  }

  /**
   * Copies properties of `source` to `object`.
   *
   * @private
   * @param {Object} source The object to copy properties from.
   * @param {Array} props The property identifiers to copy.
   * @param {Object} [object={}] The object to copy properties to.
   * @param {Function} [customizer] The function to customize copied values.
   * @returns {Object} Returns `object`.
   */
  function copyObject(source, props, object, customizer) {
    object || (object = {});

    var index = -1,
        length = props.length;

    while (++index < length) {
      var key = props[index];

      var newValue = customizer
        ? customizer(object[key], source[key], key, object, source)
        : undefined;

      assignValue(object, key, newValue === undefined ? source[key] : newValue);
    }
    return object;
  }

  /**
   * Copies own symbol properties of `source` to `object`.
   *
   * @private
   * @param {Object} source The object to copy symbols from.
   * @param {Object} [object={}] The object to copy symbols to.
   * @returns {Object} Returns `object`.
   */
  function copySymbols(source, object) {
    return copyObject(source, getSymbols(source), object);
  }

  /**
   * A specialized version of `baseIsEqualDeep` for arrays with support for
   * partial deep comparisons.
   *
   * @private
   * @param {Array} array The array to compare.
   * @param {Array} other The other array to compare.
   * @param {Function} equalFunc The function to determine equivalents of values.
   * @param {Function} customizer The function to customize comparisons.
   * @param {number} bitmask The bitmask of comparison flags. See `baseIsEqual`
   *  for more details.
   * @param {Object} stack Tracks traversed `array` and `other` objects.
   * @returns {boolean} Returns `true` if the arrays are equivalent, else `false`.
   */
  function equalArrays(array, other, equalFunc, customizer, bitmask, stack) {
    var isPartial = bitmask & PARTIAL_COMPARE_FLAG,
        arrLength = array.length,
        othLength = other.length;

    if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
      return false;
    }
    // Assume cyclic values are equal.
    var stacked = stack.get(array);
    if (stacked && stack.get(other)) {
      return stacked == other;
    }
    var index = -1,
        result = true,
        seen = (bitmask & UNORDERED_COMPARE_FLAG) ? new SetCache : undefined;

    stack.set(array, other);
    stack.set(other, array);

    // Ignore non-index properties.
    while (++index < arrLength) {
      var arrValue = array[index],
          othValue = other[index];

      if (customizer) {
        var compared = isPartial
          ? customizer(othValue, arrValue, index, other, array, stack)
          : customizer(arrValue, othValue, index, array, other, stack);
      }
      if (compared !== undefined) {
        if (compared) {
          continue;
        }
        result = false;
        break;
      }
      // Recursively compare arrays (susceptible to call stack limits).
      if (seen) {
        if (!arraySome(other, function(othValue, othIndex) {
              if (!seen.has(othIndex) &&
                  (arrValue === othValue || equalFunc(arrValue, othValue, customizer, bitmask, stack))) {
                return seen.add(othIndex);
              }
            })) {
          result = false;
          break;
        }
      } else if (!(
            arrValue === othValue ||
              equalFunc(arrValue, othValue, customizer, bitmask, stack)
          )) {
        result = false;
        break;
      }
    }
    stack['delete'](array);
    stack['delete'](other);
    return result;
  }

  /**
   * A specialized version of `baseIsEqualDeep` for comparing objects of
   * the same `toStringTag`.
   *
   * **Note:** This function only supports comparing values with tags of
   * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
   *
   * @private
   * @param {Object} object The object to compare.
   * @param {Object} other The other object to compare.
   * @param {string} tag The `toStringTag` of the objects to compare.
   * @param {Function} equalFunc The function to determine equivalents of values.
   * @param {Function} customizer The function to customize comparisons.
   * @param {number} bitmask The bitmask of comparison flags. See `baseIsEqual`
   *  for more details.
   * @param {Object} stack Tracks traversed `object` and `other` objects.
   * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
   */
  function equalByTag(object, other, tag, equalFunc, customizer, bitmask, stack) {
    switch (tag) {
      case dataViewTag:
        if ((object.byteLength != other.byteLength) ||
            (object.byteOffset != other.byteOffset)) {
          return false;
        }
        object = object.buffer;
        other = other.buffer;

      case arrayBufferTag:
        if ((object.byteLength != other.byteLength) ||
            !equalFunc(new Uint8Array(object), new Uint8Array(other))) {
          return false;
        }
        return true;

      case boolTag:
      case dateTag:
      case numberTag:
        // Coerce booleans to `1` or `0` and dates to milliseconds.
        // Invalid dates are coerced to `NaN`.
        return eq(+object, +other);

      case errorTag:
        return object.name == other.name && object.message == other.message;

      case regexpTag:
      case stringTag:
        // Coerce regexes to strings and treat strings, primitives and objects,
        // as equal. See http://www.ecma-international.org/ecma-262/7.0/#sec-regexp.prototype.tostring
        // for more details.
        return object == (other + '');

      case mapTag:
        var convert = mapToArray;

      case setTag:
        var isPartial = bitmask & PARTIAL_COMPARE_FLAG;
        convert || (convert = setToArray);

        if (object.size != other.size && !isPartial) {
          return false;
        }
        // Assume cyclic values are equal.
        var stacked = stack.get(object);
        if (stacked) {
          return stacked == other;
        }
        bitmask |= UNORDERED_COMPARE_FLAG;

        // Recursively compare objects (susceptible to call stack limits).
        stack.set(object, other);
        var result = equalArrays(convert(object), convert(other), equalFunc, customizer, bitmask, stack);
        stack['delete'](object);
        return result;

      case symbolTag:
        if (symbolValueOf) {
          return symbolValueOf.call(object) == symbolValueOf.call(other);
        }
    }
    return false;
  }

  /**
   * A specialized version of `baseIsEqualDeep` for objects with support for
   * partial deep comparisons.
   *
   * @private
   * @param {Object} object The object to compare.
   * @param {Object} other The other object to compare.
   * @param {Function} equalFunc The function to determine equivalents of values.
   * @param {Function} customizer The function to customize comparisons.
   * @param {number} bitmask The bitmask of comparison flags. See `baseIsEqual`
   *  for more details.
   * @param {Object} stack Tracks traversed `object` and `other` objects.
   * @returns {boolean} Returns `true` if the objects are equivalent, else `false`.
   */
  function equalObjects(object, other, equalFunc, customizer, bitmask, stack) {
    var isPartial = bitmask & PARTIAL_COMPARE_FLAG,
        objProps = keys(object),
        objLength = objProps.length,
        othProps = keys(other),
        othLength = othProps.length;

    if (objLength != othLength && !isPartial) {
      return false;
    }
    var index = objLength;
    while (index--) {
      var key = objProps[index];
      if (!(isPartial ? key in other : hasOwnProperty.call(other, key))) {
        return false;
      }
    }
    // Assume cyclic values are equal.
    var stacked = stack.get(object);
    if (stacked && stack.get(other)) {
      return stacked == other;
    }
    var result = true;
    stack.set(object, other);
    stack.set(other, object);

    var skipCtor = isPartial;
    while (++index < objLength) {
      key = objProps[index];
      var objValue = object[key],
          othValue = other[key];

      if (customizer) {
        var compared = isPartial
          ? customizer(othValue, objValue, key, other, object, stack)
          : customizer(objValue, othValue, key, object, other, stack);
      }
      // Recursively compare objects (susceptible to call stack limits).
      if (!(compared === undefined
            ? (objValue === othValue || equalFunc(objValue, othValue, customizer, bitmask, stack))
            : compared
          )) {
        result = false;
        break;
      }
      skipCtor || (skipCtor = key == 'constructor');
    }
    if (result && !skipCtor) {
      var objCtor = object.constructor,
          othCtor = other.constructor;

      // Non `Object` object instances with different constructors are not equal.
      if (objCtor != othCtor &&
          ('constructor' in object && 'constructor' in other) &&
          !(typeof objCtor == 'function' && objCtor instanceof objCtor &&
            typeof othCtor == 'function' && othCtor instanceof othCtor)) {
        result = false;
      }
    }
    stack['delete'](object);
    stack['delete'](other);
    return result;
  }

  /**
   * Creates an array of own enumerable property names and symbols of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names and symbols.
   */
  function getAllKeys(object) {
    return baseGetAllKeys(object, keys, getSymbols);
  }

  /**
   * Gets the data for `map`.
   *
   * @private
   * @param {Object} map The map to query.
   * @param {string} key The reference key.
   * @returns {*} Returns the map data.
   */
  function getMapData(map, key) {
    var data = map.__data__;
    return isKeyable(key)
      ? data[typeof key == 'string' ? 'string' : 'hash']
      : data.map;
  }

  /**
   * Gets the property names, values, and compare flags of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the match data of `object`.
   */
  function getMatchData(object) {
    var result = keys(object),
        length = result.length;

    while (length--) {
      var key = result[length],
          value = object[key];

      result[length] = [key, value, isStrictComparable(value)];
    }
    return result;
  }

  /**
   * Gets the native function at `key` of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {string} key The key of the method to get.
   * @returns {*} Returns the function if it's native, else `undefined`.
   */
  function getNative(object, key) {
    var value = getValue(object, key);
    return baseIsNative(value) ? value : undefined;
  }

  /**
   * Creates an array of the own enumerable symbol properties of `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of symbols.
   */
  var getSymbols = nativeGetSymbols ? overArg(nativeGetSymbols, Object) : stubArray;

  /**
   * Gets the `toStringTag` of `value`.
   *
   * @private
   * @param {*} value The value to query.
   * @returns {string} Returns the `toStringTag`.
   */
  var getTag = baseGetTag;

  // Fallback for data views, maps, sets, and weak maps in IE 11,
  // for data views in Edge < 14, and promises in Node.js.
  if ((DataView && getTag(new DataView(new ArrayBuffer(1))) != dataViewTag) ||
      (Map && getTag(new Map) != mapTag) ||
      (Promise && getTag(Promise.resolve()) != promiseTag) ||
      (Set && getTag(new Set) != setTag) ||
      (WeakMap && getTag(new WeakMap) != weakMapTag)) {
    getTag = function(value) {
      var result = objectToString.call(value),
          Ctor = result == objectTag ? value.constructor : undefined,
          ctorString = Ctor ? toSource(Ctor) : undefined;

      if (ctorString) {
        switch (ctorString) {
          case dataViewCtorString: return dataViewTag;
          case mapCtorString: return mapTag;
          case promiseCtorString: return promiseTag;
          case setCtorString: return setTag;
          case weakMapCtorString: return weakMapTag;
        }
      }
      return result;
    };
  }

  /**
   * Checks if `path` exists on `object`.
   *
   * @private
   * @param {Object} object The object to query.
   * @param {Array|string} path The path to check.
   * @param {Function} hasFunc The function to check properties.
   * @returns {boolean} Returns `true` if `path` exists, else `false`.
   */
  function hasPath(object, path, hasFunc) {
    path = isKey(path, object) ? [path] : castPath(path);

    var result,
        index = -1,
        length = path.length;

    while (++index < length) {
      var key = toKey(path[index]);
      if (!(result = object != null && hasFunc(object, key))) {
        break;
      }
      object = object[key];
    }
    if (result) {
      return result;
    }
    var length = object ? object.length : 0;
    return !!length && isLength(length) && isIndex(key, length) &&
      (isArray(object) || isArguments(object));
  }

  /**
   * Initializes an array clone.
   *
   * @private
   * @param {Array} array The array to clone.
   * @returns {Array} Returns the initialized clone.
   */
  function initCloneArray(array) {
    var length = array.length,
        result = array.constructor(length);

    // Add properties assigned by `RegExp#exec`.
    if (length && typeof array[0] == 'string' && hasOwnProperty.call(array, 'index')) {
      result.index = array.index;
      result.input = array.input;
    }
    return result;
  }

  /**
   * Initializes an object clone.
   *
   * @private
   * @param {Object} object The object to clone.
   * @returns {Object} Returns the initialized clone.
   */
  function initCloneObject(object) {
    return (typeof object.constructor == 'function' && !isPrototype(object))
      ? baseCreate(getPrototype(object))
      : {};
  }

  /**
   * Initializes an object clone based on its `toStringTag`.
   *
   * **Note:** This function only supports cloning values with tags of
   * `Boolean`, `Date`, `Error`, `Number`, `RegExp`, or `String`.
   *
   * @private
   * @param {Object} object The object to clone.
   * @param {string} tag The `toStringTag` of the object to clone.
   * @param {Function} cloneFunc The function to clone values.
   * @param {boolean} [isDeep] Specify a deep clone.
   * @returns {Object} Returns the initialized clone.
   */
  function initCloneByTag(object, tag, cloneFunc, isDeep) {
    var Ctor = object.constructor;
    switch (tag) {
      case arrayBufferTag:
        return cloneArrayBuffer(object);

      case boolTag:
      case dateTag:
        return new Ctor(+object);

      case dataViewTag:
        return cloneDataView(object, isDeep);

      case float32Tag: case float64Tag:
      case int8Tag: case int16Tag: case int32Tag:
      case uint8Tag: case uint8ClampedTag: case uint16Tag: case uint32Tag:
        return cloneTypedArray(object, isDeep);

      case mapTag:
        return cloneMap(object, isDeep, cloneFunc);

      case numberTag:
      case stringTag:
        return new Ctor(object);

      case regexpTag:
        return cloneRegExp(object);

      case setTag:
        return cloneSet(object, isDeep, cloneFunc);

      case symbolTag:
        return cloneSymbol(object);
    }
  }

  /**
   * Checks if `value` is a valid array-like index.
   *
   * @private
   * @param {*} value The value to check.
   * @param {number} [length=MAX_SAFE_INTEGER] The upper bounds of a valid index.
   * @returns {boolean} Returns `true` if `value` is a valid index, else `false`.
   */
  function isIndex(value, length) {
    length = length == null ? MAX_SAFE_INTEGER : length;
    return !!length &&
      (typeof value == 'number' || reIsUint.test(value)) &&
      (value > -1 && value % 1 == 0 && value < length);
  }

  /**
   * Checks if `value` is a property name and not a property path.
   *
   * @private
   * @param {*} value The value to check.
   * @param {Object} [object] The object to query keys on.
   * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
   */
  function isKey(value, object) {
    if (isArray(value)) {
      return false;
    }
    var type = typeof value;
    if (type == 'number' || type == 'symbol' || type == 'boolean' ||
        value == null || isSymbol(value)) {
      return true;
    }
    return reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
      (object != null && value in Object(object));
  }

  /**
   * Checks if `value` is suitable for use as unique object key.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
   */
  function isKeyable(value) {
    var type = typeof value;
    return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
      ? (value !== '__proto__')
      : (value === null);
  }

  /**
   * Checks if `func` has its source masked.
   *
   * @private
   * @param {Function} func The function to check.
   * @returns {boolean} Returns `true` if `func` is masked, else `false`.
   */
  function isMasked(func) {
    return !!maskSrcKey && (maskSrcKey in func);
  }

  /**
   * Checks if `value` is likely a prototype object.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a prototype, else `false`.
   */
  function isPrototype(value) {
    var Ctor = value && value.constructor,
        proto = (typeof Ctor == 'function' && Ctor.prototype) || objectProto;

    return value === proto;
  }

  /**
   * Checks if `value` is suitable for strict equality comparisons, i.e. `===`.
   *
   * @private
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` if suitable for strict
   *  equality comparisons, else `false`.
   */
  function isStrictComparable(value) {
    return value === value && !isObject(value);
  }

  /**
   * A specialized version of `matchesProperty` for source values suitable
   * for strict equality comparisons, i.e. `===`.
   *
   * @private
   * @param {string} key The key of the property to get.
   * @param {*} srcValue The value to match.
   * @returns {Function} Returns the new spec function.
   */
  function matchesStrictComparable(key, srcValue) {
    return function(object) {
      if (object == null) {
        return false;
      }
      return object[key] === srcValue &&
        (srcValue !== undefined || (key in Object(object)));
    };
  }

  /**
   * Converts `string` to a property path array.
   *
   * @private
   * @param {string} string The string to convert.
   * @returns {Array} Returns the property path array.
   */
  var stringToPath = memoize(function(string) {
    string = toString(string);

    var result = [];
    if (reLeadingDot.test(string)) {
      result.push('');
    }
    string.replace(rePropName, function(match, number, quote, string) {
      result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
    });
    return result;
  });

  /**
   * Converts `value` to a string key if it's not a string or symbol.
   *
   * @private
   * @param {*} value The value to inspect.
   * @returns {string|symbol} Returns the key.
   */
  function toKey(value) {
    if (typeof value == 'string' || isSymbol(value)) {
      return value;
    }
    var result = (value + '');
    return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
  }

  /**
   * Converts `func` to its source code.
   *
   * @private
   * @param {Function} func The function to process.
   * @returns {string} Returns the source code.
   */
  function toSource(func) {
    if (func != null) {
      try {
        return funcToString.call(func);
      } catch (e) {}
      try {
        return (func + '');
      } catch (e) {}
    }
    return '';
  }

  /**
   * Creates a function that memoizes the result of `func`. If `resolver` is
   * provided, it determines the cache key for storing the result based on the
   * arguments provided to the memoized function. By default, the first argument
   * provided to the memoized function is used as the map cache key. The `func`
   * is invoked with the `this` binding of the memoized function.
   *
   * **Note:** The cache is exposed as the `cache` property on the memoized
   * function. Its creation may be customized by replacing the `_.memoize.Cache`
   * constructor with one whose instances implement the
   * [`Map`](http://ecma-international.org/ecma-262/7.0/#sec-properties-of-the-map-prototype-object)
   * method interface of `delete`, `get`, `has`, and `set`.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Function
   * @param {Function} func The function to have its output memoized.
   * @param {Function} [resolver] The function to resolve the cache key.
   * @returns {Function} Returns the new memoized function.
   * @example
   *
   * var object = { 'a': 1, 'b': 2 };
   * var other = { 'c': 3, 'd': 4 };
   *
   * var values = _.memoize(_.values);
   * values(object);
   * // => [1, 2]
   *
   * values(other);
   * // => [3, 4]
   *
   * object.a = 2;
   * values(object);
   * // => [1, 2]
   *
   * // Modify the result cache.
   * values.cache.set(object, ['a', 'b']);
   * values(object);
   * // => ['a', 'b']
   *
   * // Replace `_.memoize.Cache`.
   * _.memoize.Cache = WeakMap;
   */
  function memoize(func, resolver) {
    if (typeof func != 'function' || (resolver && typeof resolver != 'function')) {
      throw new TypeError(FUNC_ERROR_TEXT);
    }
    var memoized = function() {
      var args = arguments,
          key = resolver ? resolver.apply(this, args) : args[0],
          cache = memoized.cache;

      if (cache.has(key)) {
        return cache.get(key);
      }
      var result = func.apply(this, args);
      memoized.cache = cache.set(key, result);
      return result;
    };
    memoized.cache = new (memoize.Cache || MapCache);
    return memoized;
  }

  // Assign cache to `_.memoize`.
  memoize.Cache = MapCache;

  /**
   * Performs a
   * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
   * comparison between two values to determine if they are equivalent.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to compare.
   * @param {*} other The other value to compare.
   * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
   * @example
   *
   * var object = { 'a': 1 };
   * var other = { 'a': 1 };
   *
   * _.eq(object, object);
   * // => true
   *
   * _.eq(object, other);
   * // => false
   *
   * _.eq('a', 'a');
   * // => true
   *
   * _.eq('a', Object('a'));
   * // => false
   *
   * _.eq(NaN, NaN);
   * // => true
   */
  function eq(value, other) {
    return value === other || (value !== value && other !== other);
  }

  /**
   * Checks if `value` is likely an `arguments` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an `arguments` object,
   *  else `false`.
   * @example
   *
   * _.isArguments(function() { return arguments; }());
   * // => true
   *
   * _.isArguments([1, 2, 3]);
   * // => false
   */
  function isArguments(value) {
    // Safari 8.1 makes `arguments.callee` enumerable in strict mode.
    return isArrayLikeObject(value) && hasOwnProperty.call(value, 'callee') &&
      (!propertyIsEnumerable.call(value, 'callee') || objectToString.call(value) == argsTag);
  }

  /**
   * Checks if `value` is classified as an `Array` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an array, else `false`.
   * @example
   *
   * _.isArray([1, 2, 3]);
   * // => true
   *
   * _.isArray(document.body.children);
   * // => false
   *
   * _.isArray('abc');
   * // => false
   *
   * _.isArray(_.noop);
   * // => false
   */
  var isArray = Array.isArray;

  /**
   * Checks if `value` is array-like. A value is considered array-like if it's
   * not a function and has a `value.length` that's an integer greater than or
   * equal to `0` and less than or equal to `Number.MAX_SAFE_INTEGER`.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is array-like, else `false`.
   * @example
   *
   * _.isArrayLike([1, 2, 3]);
   * // => true
   *
   * _.isArrayLike(document.body.children);
   * // => true
   *
   * _.isArrayLike('abc');
   * // => true
   *
   * _.isArrayLike(_.noop);
   * // => false
   */
  function isArrayLike(value) {
    return value != null && isLength(value.length) && !isFunction(value);
  }

  /**
   * This method is like `_.isArrayLike` except that it also checks if `value`
   * is an object.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an array-like object,
   *  else `false`.
   * @example
   *
   * _.isArrayLikeObject([1, 2, 3]);
   * // => true
   *
   * _.isArrayLikeObject(document.body.children);
   * // => true
   *
   * _.isArrayLikeObject('abc');
   * // => false
   *
   * _.isArrayLikeObject(_.noop);
   * // => false
   */
  function isArrayLikeObject(value) {
    return isObjectLike(value) && isArrayLike(value);
  }

  /**
   * Checks if `value` is a buffer.
   *
   * @static
   * @memberOf _
   * @since 4.3.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a buffer, else `false`.
   * @example
   *
   * _.isBuffer(new Buffer(2));
   * // => true
   *
   * _.isBuffer(new Uint8Array(2));
   * // => false
   */
  var isBuffer = nativeIsBuffer || stubFalse;

  /**
   * Checks if `value` is classified as a `Function` object.
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a function, else `false`.
   * @example
   *
   * _.isFunction(_);
   * // => true
   *
   * _.isFunction(/abc/);
   * // => false
   */
  function isFunction(value) {
    // The use of `Object#toString` avoids issues with the `typeof` operator
    // in Safari 8-9 which returns 'object' for typed array and other constructors.
    var tag = isObject(value) ? objectToString.call(value) : '';
    return tag == funcTag || tag == genTag;
  }

  /**
   * Checks if `value` is a valid array-like length.
   *
   * **Note:** This method is loosely based on
   * [`ToLength`](http://ecma-international.org/ecma-262/7.0/#sec-tolength).
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a valid length, else `false`.
   * @example
   *
   * _.isLength(3);
   * // => true
   *
   * _.isLength(Number.MIN_VALUE);
   * // => false
   *
   * _.isLength(Infinity);
   * // => false
   *
   * _.isLength('3');
   * // => false
   */
  function isLength(value) {
    return typeof value == 'number' &&
      value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
  }

  /**
   * Checks if `value` is the
   * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
   * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
   *
   * @static
   * @memberOf _
   * @since 0.1.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is an object, else `false`.
   * @example
   *
   * _.isObject({});
   * // => true
   *
   * _.isObject([1, 2, 3]);
   * // => true
   *
   * _.isObject(_.noop);
   * // => true
   *
   * _.isObject(null);
   * // => false
   */
  function isObject(value) {
    var type = typeof value;
    return !!value && (type == 'object' || type == 'function');
  }

  /**
   * Checks if `value` is object-like. A value is object-like if it's not `null`
   * and has a `typeof` result of "object".
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
   * @example
   *
   * _.isObjectLike({});
   * // => true
   *
   * _.isObjectLike([1, 2, 3]);
   * // => true
   *
   * _.isObjectLike(_.noop);
   * // => false
   *
   * _.isObjectLike(null);
   * // => false
   */
  function isObjectLike(value) {
    return !!value && typeof value == 'object';
  }

  /**
   * Checks if `value` is classified as a `Symbol` primitive or object.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
   * @example
   *
   * _.isSymbol(Symbol.iterator);
   * // => true
   *
   * _.isSymbol('abc');
   * // => false
   */
  function isSymbol(value) {
    return typeof value == 'symbol' ||
      (isObjectLike(value) && objectToString.call(value) == symbolTag);
  }

  /**
   * Checks if `value` is classified as a typed array.
   *
   * @static
   * @memberOf _
   * @since 3.0.0
   * @category Lang
   * @param {*} value The value to check.
   * @returns {boolean} Returns `true` if `value` is a typed array, else `false`.
   * @example
   *
   * _.isTypedArray(new Uint8Array);
   * // => true
   *
   * _.isTypedArray([]);
   * // => false
   */
  var isTypedArray = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;

  /**
   * Converts `value` to a string. An empty string is returned for `null`
   * and `undefined` values. The sign of `-0` is preserved.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Lang
   * @param {*} value The value to process.
   * @returns {string} Returns the string.
   * @example
   *
   * _.toString(null);
   * // => ''
   *
   * _.toString(-0);
   * // => '-0'
   *
   * _.toString([1, 2, 3]);
   * // => '1,2,3'
   */
  function toString(value) {
    return value == null ? '' : baseToString(value);
  }

  /**
   * Gets the value at `path` of `object`. If the resolved value is
   * `undefined`, the `defaultValue` is returned in its place.
   *
   * @static
   * @memberOf _
   * @since 3.7.0
   * @category Object
   * @param {Object} object The object to query.
   * @param {Array|string} path The path of the property to get.
   * @param {*} [defaultValue] The value returned for `undefined` resolved values.
   * @returns {*} Returns the resolved value.
   * @example
   *
   * var object = { 'a': [{ 'b': { 'c': 3 } }] };
   *
   * _.get(object, 'a[0].b.c');
   * // => 3
   *
   * _.get(object, ['a', '0', 'b', 'c']);
   * // => 3
   *
   * _.get(object, 'a.b.c', 'default');
   * // => 'default'
   */
  function get(object, path, defaultValue) {
    var result = object == null ? undefined : baseGet(object, path);
    return result === undefined ? defaultValue : result;
  }

  /**
   * Checks if `path` is a direct or inherited property of `object`.
   *
   * @static
   * @memberOf _
   * @since 4.0.0
   * @category Object
   * @param {Object} object The object to query.
   * @param {Array|string} path The path to check.
   * @returns {boolean} Returns `true` if `path` exists, else `false`.
   * @example
   *
   * var object = _.create({ 'a': _.create({ 'b': 2 }) });
   *
   * _.hasIn(object, 'a');
   * // => true
   *
   * _.hasIn(object, 'a.b');
   * // => true
   *
   * _.hasIn(object, ['a', 'b']);
   * // => true
   *
   * _.hasIn(object, 'b');
   * // => false
   */
  function hasIn(object, path) {
    return object != null && hasPath(object, path, baseHasIn);
  }

  /**
   * Creates an array of the own enumerable property names of `object`.
   *
   * **Note:** Non-object values are coerced to objects. See the
   * [ES spec](http://ecma-international.org/ecma-262/7.0/#sec-object.keys)
   * for more details.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Object
   * @param {Object} object The object to query.
   * @returns {Array} Returns the array of property names.
   * @example
   *
   * function Foo() {
   *   this.a = 1;
   *   this.b = 2;
   * }
   *
   * Foo.prototype.c = 3;
   *
   * _.keys(new Foo);
   * // => ['a', 'b'] (iteration order is not guaranteed)
   *
   * _.keys('hi');
   * // => ['0', '1']
   */
  function keys(object) {
    return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
  }

  /**
   * This method returns the first argument it receives.
   *
   * @static
   * @since 0.1.0
   * @memberOf _
   * @category Util
   * @param {*} value Any value.
   * @returns {*} Returns `value`.
   * @example
   *
   * var object = { 'a': 1 };
   *
   * console.log(_.identity(object) === object);
   * // => true
   */
  function identity(value) {
    return value;
  }

  /**
   * Creates a function that invokes `func` with the arguments of the created
   * function. If `func` is a property name, the created function returns the
   * property value for a given element. If `func` is an array or object, the
   * created function returns `true` for elements that contain the equivalent
   * source properties, otherwise it returns `false`.
   *
   * @static
   * @since 4.0.0
   * @memberOf _
   * @category Util
   * @param {*} [func=_.identity] The value to convert to a callback.
   * @returns {Function} Returns the callback.
   * @example
   *
   * var users = [
   *   { 'user': 'barney', 'age': 36, 'active': true },
   *   { 'user': 'fred',   'age': 40, 'active': false }
   * ];
   *
   * // The `_.matches` iteratee shorthand.
   * _.filter(users, _.iteratee({ 'user': 'barney', 'active': true }));
   * // => [{ 'user': 'barney', 'age': 36, 'active': true }]
   *
   * // The `_.matchesProperty` iteratee shorthand.
   * _.filter(users, _.iteratee(['user', 'fred']));
   * // => [{ 'user': 'fred', 'age': 40 }]
   *
   * // The `_.property` iteratee shorthand.
   * _.map(users, _.iteratee('user'));
   * // => ['barney', 'fred']
   *
   * // Create custom iteratee shorthands.
   * _.iteratee = _.wrap(_.iteratee, function(iteratee, func) {
   *   return !_.isRegExp(func) ? iteratee(func) : function(string) {
   *     return func.test(string);
   *   };
   * });
   *
   * _.filter(['abc', 'def'], /ef/);
   * // => ['def']
   */
  function iteratee(func) {
    return baseIteratee(typeof func == 'function' ? func : baseClone(func, true));
  }

  /**
   * Creates a function that returns the value at `path` of a given object.
   *
   * @static
   * @memberOf _
   * @since 2.4.0
   * @category Util
   * @param {Array|string} path The path of the property to get.
   * @returns {Function} Returns the new accessor function.
   * @example
   *
   * var objects = [
   *   { 'a': { 'b': 2 } },
   *   { 'a': { 'b': 1 } }
   * ];
   *
   * _.map(objects, _.property('a.b'));
   * // => [2, 1]
   *
   * _.map(_.sortBy(objects, _.property(['a', 'b'])), 'a.b');
   * // => [1, 2]
   */
  function property(path) {
    return isKey(path) ? baseProperty(toKey(path)) : basePropertyDeep(path);
  }

  /**
   * This method returns a new empty array.
   *
   * @static
   * @memberOf _
   * @since 4.13.0
   * @category Util
   * @returns {Array} Returns the new empty array.
   * @example
   *
   * var arrays = _.times(2, _.stubArray);
   *
   * console.log(arrays);
   * // => [[], []]
   *
   * console.log(arrays[0] === arrays[1]);
   * // => false
   */
  function stubArray() {
    return [];
  }

  /**
   * This method returns `false`.
   *
   * @static
   * @memberOf _
   * @since 4.13.0
   * @category Util
   * @returns {boolean} Returns `false`.
   * @example
   *
   * _.times(2, _.stubFalse);
   * // => [false, false]
   */
  function stubFalse() {
    return false;
  }

  module.exports = iteratee;

  }).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
  },{}],68:[function(require,module,exports){
  (function (process){
  // Copyright Joyent, Inc. and other Node contributors.
  //
  // Permission is hereby granted, free of charge, to any person obtaining a
  // copy of this software and associated documentation files (the
  // "Software"), to deal in the Software without restriction, including
  // without limitation the rights to use, copy, modify, merge, publish,
  // distribute, sublicense, and/or sell copies of the Software, and to permit
  // persons to whom the Software is furnished to do so, subject to the
  // following conditions:
  //
  // The above copyright notice and this permission notice shall be included
  // in all copies or substantial portions of the Software.
  //
  // THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
  // OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
  // MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
  // NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
  // DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
  // OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
  // USE OR OTHER DEALINGS IN THE SOFTWARE.

  // resolves . and .. elements in a path array with directory names there
  // must be no slashes, empty elements, or device names (c:\) in the array
  // (so also no leading and trailing slashes - it does not distinguish
  // relative and absolute paths)
  function normalizeArray(parts, allowAboveRoot) {
    // if the path tries to go above the root, `up` ends up > 0
    var up = 0;
    for (var i = parts.length - 1; i >= 0; i--) {
      var last = parts[i];
      if (last === '.') {
        parts.splice(i, 1);
      } else if (last === '..') {
        parts.splice(i, 1);
        up++;
      } else if (up) {
        parts.splice(i, 1);
        up--;
      }
    }

    // if the path is allowed to go above the root, restore leading ..s
    if (allowAboveRoot) {
      for (; up--; up) {
        parts.unshift('..');
      }
    }

    return parts;
  }

  // Split a filename into [root, dir, basename, ext], unix version
  // 'root' is just a slash, or nothing.
  var splitPathRe =
      /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
  var splitPath = function(filename) {
    return splitPathRe.exec(filename).slice(1);
  };

  // path.resolve([from ...], to)
  // posix version
  exports.resolve = function() {
    var resolvedPath = '',
        resolvedAbsolute = false;

    for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
      var path = (i >= 0) ? arguments[i] : process.cwd();

      // Skip empty and invalid entries
      if (typeof path !== 'string') {
        throw new TypeError('Arguments to path.resolve must be strings');
      } else if (!path) {
        continue;
      }

      resolvedPath = path + '/' + resolvedPath;
      resolvedAbsolute = path.charAt(0) === '/';
    }

    // At this point the path should be resolved to a full absolute path, but
    // handle relative paths to be safe (might happen when process.cwd() fails)

    // Normalize the path
    resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
      return !!p;
    }), !resolvedAbsolute).join('/');

    return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
  };

  // path.normalize(path)
  // posix version
  exports.normalize = function(path) {
    var isAbsolute = exports.isAbsolute(path),
        trailingSlash = substr(path, -1) === '/';

    // Normalize the path
    path = normalizeArray(filter(path.split('/'), function(p) {
      return !!p;
    }), !isAbsolute).join('/');

    if (!path && !isAbsolute) {
      path = '.';
    }
    if (path && trailingSlash) {
      path += '/';
    }

    return (isAbsolute ? '/' : '') + path;
  };

  // posix version
  exports.isAbsolute = function(path) {
    return path.charAt(0) === '/';
  };

  // posix version
  exports.join = function() {
    var paths = Array.prototype.slice.call(arguments, 0);
    return exports.normalize(filter(paths, function(p, index) {
      if (typeof p !== 'string') {
        throw new TypeError('Arguments to path.join must be strings');
      }
      return p;
    }).join('/'));
  };


  // path.relative(from, to)
  // posix version
  exports.relative = function(from, to) {
    from = exports.resolve(from).substr(1);
    to = exports.resolve(to).substr(1);

    function trim(arr) {
      var start = 0;
      for (; start < arr.length; start++) {
        if (arr[start] !== '') break;
      }

      var end = arr.length - 1;
      for (; end >= 0; end--) {
        if (arr[end] !== '') break;
      }

      if (start > end) return [];
      return arr.slice(start, end - start + 1);
    }

    var fromParts = trim(from.split('/'));
    var toParts = trim(to.split('/'));

    var length = Math.min(fromParts.length, toParts.length);
    var samePartsLength = length;
    for (var i = 0; i < length; i++) {
      if (fromParts[i] !== toParts[i]) {
        samePartsLength = i;
        break;
      }
    }

    var outputParts = [];
    for (var i = samePartsLength; i < fromParts.length; i++) {
      outputParts.push('..');
    }

    outputParts = outputParts.concat(toParts.slice(samePartsLength));

    return outputParts.join('/');
  };

  exports.sep = '/';
  exports.delimiter = ':';

  exports.dirname = function(path) {
    var result = splitPath(path),
        root = result[0],
        dir = result[1];

    if (!root && !dir) {
      // No dirname whatsoever
      return '.';
    }

    if (dir) {
      // It has a dirname, strip trailing slash
      dir = dir.substr(0, dir.length - 1);
    }

    return root + dir;
  };


  exports.basename = function(path, ext) {
    var f = splitPath(path)[2];
    // TODO: make this comparison case-insensitive on windows?
    if (ext && f.substr(-1 * ext.length) === ext) {
      f = f.substr(0, f.length - ext.length);
    }
    return f;
  };


  exports.extname = function(path) {
    return splitPath(path)[3];
  };

  function filter (xs, f) {
      if (xs.filter) return xs.filter(f);
      var res = [];
      for (var i = 0; i < xs.length; i++) {
          if (f(xs[i], i, xs)) res.push(xs[i]);
      }
      return res;
  }

  // String.prototype.substr - negative index don't work in IE8
  var substr = 'ab'.substr(-1) === 'b'
      ? function (str, start, len) { return str.substr(start, len) }
      : function (str, start, len) {
          if (start < 0) start = str.length + start;
          return str.substr(start, len);
      }
  ;

  }).call(this,require('_process'))
  },{"_process":69}],69:[function(require,module,exports){
  // shim for using process in browser
  var process = module.exports = {};

  // cached from whatever global is present so that test runners that stub it
  // don't break things.  But we need to wrap it in a try catch in case it is
  // wrapped in strict mode code which doesn't define any globals.  It's inside a
  // function because try/catches deoptimize in certain engines.

  var cachedSetTimeout;
  var cachedClearTimeout;

  function defaultSetTimout() {
      throw new Error('setTimeout has not been defined');
  }
  function defaultClearTimeout () {
      throw new Error('clearTimeout has not been defined');
  }
  (function () {
      try {
          if (typeof setTimeout === 'function') {
              cachedSetTimeout = setTimeout;
          } else {
              cachedSetTimeout = defaultSetTimout;
          }
      } catch (e) {
          cachedSetTimeout = defaultSetTimout;
      }
      try {
          if (typeof clearTimeout === 'function') {
              cachedClearTimeout = clearTimeout;
          } else {
              cachedClearTimeout = defaultClearTimeout;
          }
      } catch (e) {
          cachedClearTimeout = defaultClearTimeout;
      }
  } ())
  function runTimeout(fun) {
      if (cachedSetTimeout === setTimeout) {
          //normal enviroments in sane situations
          return setTimeout(fun, 0);
      }
      // if setTimeout wasn't available but was latter defined
      if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
          cachedSetTimeout = setTimeout;
          return setTimeout(fun, 0);
      }
      try {
          // when when somebody has screwed with setTimeout but no I.E. maddness
          return cachedSetTimeout(fun, 0);
      } catch(e){
          try {
              // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
              return cachedSetTimeout.call(null, fun, 0);
          } catch(e){
              // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
              return cachedSetTimeout.call(this, fun, 0);
          }
      }


  }
  function runClearTimeout(marker) {
      if (cachedClearTimeout === clearTimeout) {
          //normal enviroments in sane situations
          return clearTimeout(marker);
      }
      // if clearTimeout wasn't available but was latter defined
      if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
          cachedClearTimeout = clearTimeout;
          return clearTimeout(marker);
      }
      try {
          // when when somebody has screwed with setTimeout but no I.E. maddness
          return cachedClearTimeout(marker);
      } catch (e){
          try {
              // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
              return cachedClearTimeout.call(null, marker);
          } catch (e){
              // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
              // Some versions of I.E. have different rules for clearTimeout vs setTimeout
              return cachedClearTimeout.call(this, marker);
          }
      }



  }
  var queue = [];
  var draining = false;
  var currentQueue;
  var queueIndex = -1;

  function cleanUpNextTick() {
      if (!draining || !currentQueue) {
          return;
      }
      draining = false;
      if (currentQueue.length) {
          queue = currentQueue.concat(queue);
      } else {
          queueIndex = -1;
      }
      if (queue.length) {
          drainQueue();
      }
  }

  function drainQueue() {
      if (draining) {
          return;
      }
      var timeout = runTimeout(cleanUpNextTick);
      draining = true;

      var len = queue.length;
      while(len) {
          currentQueue = queue;
          queue = [];
          while (++queueIndex < len) {
              if (currentQueue) {
                  currentQueue[queueIndex].run();
              }
          }
          queueIndex = -1;
          len = queue.length;
      }
      currentQueue = null;
      draining = false;
      runClearTimeout(timeout);
  }

  process.nextTick = function (fun) {
      var args = new Array(arguments.length - 1);
      if (arguments.length > 1) {
          for (var i = 1; i < arguments.length; i++) {
              args[i - 1] = arguments[i];
          }
      }
      queue.push(new Item(fun, args));
      if (queue.length === 1 && !draining) {
          runTimeout(drainQueue);
      }
  };

  // v8 likes predictible objects
  function Item(fun, array) {
      this.fun = fun;
      this.array = array;
  }
  Item.prototype.run = function () {
      this.fun.apply(null, this.array);
  };
  process.title = 'browser';
  process.browser = true;
  process.env = {};
  process.argv = [];
  process.version = ''; // empty string to avoid regexp issues
  process.versions = {};

  function noop() {}

  process.on = noop;
  process.addListener = noop;
  process.once = noop;
  process.off = noop;
  process.removeListener = noop;
  process.removeAllListeners = noop;
  process.emit = noop;
  process.prependListener = noop;
  process.prependOnceListener = noop;

  process.listeners = function (name) { return [] }

  process.binding = function (name) {
      throw new Error('process.binding is not supported');
  };

  process.cwd = function () { return '/' };
  process.chdir = function (dir) {
      throw new Error('process.chdir is not supported');
  };
  process.umask = function() { return 0; };

  },{}],70:[function(require,module,exports){
  'use strict'

  var normalize = require('./normalize')
  var DefinedInfo = require('./lib/util/defined-info')
  var Info = require('./lib/util/info')

  var data = 'data'

  module.exports = find

  var valid = /^data[-a-z0-9.:_]+$/i
  var dash = /-[a-z]/g
  var cap = /[A-Z]/g

  function find(schema, value) {
    var normal = normalize(value)
    var prop = value
    var Type = Info

    if (normal in schema.normal) {
      return schema.property[schema.normal[normal]]
    }

    if (normal.length > 4 && normal.slice(0, 4) === data && valid.test(value)) {
      // Attribute or property.
      if (value.charAt(4) === '-') {
        prop = datasetToProperty(value)
      } else {
        value = datasetToAttribute(value)
      }

      Type = DefinedInfo
    }

    return new Type(prop, value)
  }

  function datasetToProperty(attribute) {
    var value = attribute.slice(5).replace(dash, camelcase)
    return data + value.charAt(0).toUpperCase() + value.slice(1)
  }

  function datasetToAttribute(property) {
    var value = property.slice(4)

    if (dash.test(value)) {
      return property
    }

    value = value.replace(cap, kebab)

    if (value.charAt(0) !== '-') {
      value = '-' + value
    }

    return data + value
  }

  function kebab($0) {
    return '-' + $0.toLowerCase()
  }

  function camelcase($0) {
    return $0.charAt(1).toUpperCase()
  }

  },{"./lib/util/defined-info":78,"./lib/util/info":79,"./normalize":86}],71:[function(require,module,exports){
  'use strict'

  var merge = require('./lib/util/merge')
  var xlink = require('./lib/xlink')
  var xml = require('./lib/xml')
  var xmlns = require('./lib/xmlns')
  var aria = require('./lib/aria')
  var html = require('./lib/html')

  module.exports = merge([xml, xlink, xmlns, aria, html])

  },{"./lib/aria":72,"./lib/html":73,"./lib/util/merge":80,"./lib/xlink":83,"./lib/xml":84,"./lib/xmlns":85}],72:[function(require,module,exports){
  'use strict'

  var types = require('./util/types')
  var create = require('./util/create')

  var booleanish = types.booleanish
  var number = types.number
  var spaceSeparated = types.spaceSeparated

  module.exports = create({
    transform: ariaTransform,
    properties: {
      ariaActiveDescendant: null,
      ariaAtomic: booleanish,
      ariaAutoComplete: null,
      ariaBusy: booleanish,
      ariaChecked: booleanish,
      ariaColCount: number,
      ariaColIndex: number,
      ariaColSpan: number,
      ariaControls: spaceSeparated,
      ariaCurrent: null,
      ariaDescribedBy: spaceSeparated,
      ariaDetails: null,
      ariaDisabled: booleanish,
      ariaDropEffect: spaceSeparated,
      ariaErrorMessage: null,
      ariaExpanded: booleanish,
      ariaFlowTo: spaceSeparated,
      ariaGrabbed: booleanish,
      ariaHasPopup: null,
      ariaHidden: booleanish,
      ariaInvalid: null,
      ariaKeyShortcuts: null,
      ariaLabel: null,
      ariaLabelledBy: spaceSeparated,
      ariaLevel: number,
      ariaLive: null,
      ariaModal: booleanish,
      ariaMultiLine: booleanish,
      ariaMultiSelectable: booleanish,
      ariaOrientation: null,
      ariaOwns: spaceSeparated,
      ariaPlaceholder: null,
      ariaPosInSet: number,
      ariaPressed: booleanish,
      ariaReadOnly: booleanish,
      ariaRelevant: null,
      ariaRequired: booleanish,
      ariaRoleDescription: spaceSeparated,
      ariaRowCount: number,
      ariaRowIndex: number,
      ariaRowSpan: number,
      ariaSelected: booleanish,
      ariaSetSize: number,
      ariaSort: null,
      ariaValueMax: number,
      ariaValueMin: number,
      ariaValueNow: number,
      ariaValueText: null,
      role: null
    }
  })

  function ariaTransform(_, prop) {
    return prop === 'role' ? prop : 'aria-' + prop.slice(4).toLowerCase()
  }

  },{"./util/create":77,"./util/types":82}],73:[function(require,module,exports){
  'use strict'

  var types = require('./util/types')
  var create = require('./util/create')
  var caseInsensitiveTransform = require('./util/case-insensitive-transform')

  var boolean = types.boolean
  var overloadedBoolean = types.overloadedBoolean
  var booleanish = types.booleanish
  var number = types.number
  var spaceSeparated = types.spaceSeparated
  var commaSeparated = types.commaSeparated

  module.exports = create({
    space: 'html',
    attributes: {
      acceptcharset: 'accept-charset',
      classname: 'class',
      htmlfor: 'for',
      httpequiv: 'http-equiv'
    },
    transform: caseInsensitiveTransform,
    mustUseProperty: ['checked', 'multiple', 'muted', 'selected'],
    properties: {
      // Standard Properties.
      abbr: null,
      accept: commaSeparated,
      acceptCharset: spaceSeparated,
      accessKey: spaceSeparated,
      action: null,
      allow: null,
      allowFullScreen: boolean,
      allowPaymentRequest: boolean,
      allowUserMedia: boolean,
      alt: null,
      as: null,
      async: boolean,
      autoCapitalize: null,
      autoComplete: spaceSeparated,
      autoFocus: boolean,
      autoPlay: boolean,
      capture: boolean,
      charSet: null,
      checked: boolean,
      cite: null,
      className: spaceSeparated,
      cols: number,
      colSpan: null,
      content: null,
      contentEditable: booleanish,
      controls: boolean,
      controlsList: spaceSeparated,
      coords: number | commaSeparated,
      crossOrigin: null,
      data: null,
      dateTime: null,
      decoding: null,
      default: boolean,
      defer: boolean,
      dir: null,
      dirName: null,
      disabled: boolean,
      download: overloadedBoolean,
      draggable: booleanish,
      encType: null,
      enterKeyHint: null,
      form: null,
      formAction: null,
      formEncType: null,
      formMethod: null,
      formNoValidate: boolean,
      formTarget: null,
      headers: spaceSeparated,
      height: number,
      hidden: boolean,
      high: number,
      href: null,
      hrefLang: null,
      htmlFor: spaceSeparated,
      httpEquiv: spaceSeparated,
      id: null,
      imageSizes: null,
      imageSrcSet: commaSeparated,
      inputMode: null,
      integrity: null,
      is: null,
      isMap: boolean,
      itemId: null,
      itemProp: spaceSeparated,
      itemRef: spaceSeparated,
      itemScope: boolean,
      itemType: spaceSeparated,
      kind: null,
      label: null,
      lang: null,
      language: null,
      list: null,
      loop: boolean,
      low: number,
      manifest: null,
      max: null,
      maxLength: number,
      media: null,
      method: null,
      min: null,
      minLength: number,
      multiple: boolean,
      muted: boolean,
      name: null,
      nonce: null,
      noModule: boolean,
      noValidate: boolean,
      open: boolean,
      optimum: number,
      pattern: null,
      ping: spaceSeparated,
      placeholder: null,
      playsInline: boolean,
      poster: null,
      preload: null,
      readOnly: boolean,
      referrerPolicy: null,
      rel: spaceSeparated,
      required: boolean,
      reversed: boolean,
      rows: number,
      rowSpan: number,
      sandbox: spaceSeparated,
      scope: null,
      scoped: boolean,
      seamless: boolean,
      selected: boolean,
      shape: null,
      size: number,
      sizes: null,
      slot: null,
      span: number,
      spellCheck: booleanish,
      src: null,
      srcDoc: null,
      srcLang: null,
      srcSet: commaSeparated,
      start: number,
      step: null,
      style: null,
      tabIndex: number,
      target: null,
      title: null,
      translate: null,
      type: null,
      typeMustMatch: boolean,
      useMap: null,
      value: booleanish,
      width: number,
      wrap: null,

      // Legacy.
      // See: https://html.spec.whatwg.org/#other-elements,-attributes-and-apis
      align: null, // Several. Use CSS `text-align` instead,
      aLink: null, // `<body>`. Use CSS `a:active {color}` instead
      archive: spaceSeparated, // `<object>`. List of URIs to archives
      axis: null, // `<td>` and `<th>`. Use `scope` on `<th>`
      background: null, // `<body>`. Use CSS `background-image` instead
      bgColor: null, // `<body>` and table elements. Use CSS `background-color` instead
      border: number, // `<table>`. Use CSS `border-width` instead,
      borderColor: null, // `<table>`. Use CSS `border-color` instead,
      bottomMargin: number, // `<body>`
      cellPadding: null, // `<table>`
      cellSpacing: null, // `<table>`
      char: null, // Several table elements. When `align=char`, sets the character to align on
      charOff: null, // Several table elements. When `char`, offsets the alignment
      classId: null, // `<object>`
      clear: null, // `<br>`. Use CSS `clear` instead
      code: null, // `<object>`
      codeBase: null, // `<object>`
      codeType: null, // `<object>`
      color: null, // `<font>` and `<hr>`. Use CSS instead
      compact: boolean, // Lists. Use CSS to reduce space between items instead
      declare: boolean, // `<object>`
      event: null, // `<script>`
      face: null, // `<font>`. Use CSS instead
      frame: null, // `<table>`
      frameBorder: null, // `<iframe>`. Use CSS `border` instead
      hSpace: number, // `<img>` and `<object>`
      leftMargin: number, // `<body>`
      link: null, // `<body>`. Use CSS `a:link {color: *}` instead
      longDesc: null, // `<frame>`, `<iframe>`, and `<img>`. Use an `<a>`
      lowSrc: null, // `<img>`. Use a `<picture>`
      marginHeight: number, // `<body>`
      marginWidth: number, // `<body>`
      noResize: boolean, // `<frame>`
      noHref: boolean, // `<area>`. Use no href instead of an explicit `nohref`
      noShade: boolean, // `<hr>`. Use background-color and height instead of borders
      noWrap: boolean, // `<td>` and `<th>`
      object: null, // `<applet>`
      profile: null, // `<head>`
      prompt: null, // `<isindex>`
      rev: null, // `<link>`
      rightMargin: number, // `<body>`
      rules: null, // `<table>`
      scheme: null, // `<meta>`
      scrolling: booleanish, // `<frame>`. Use overflow in the child context
      standby: null, // `<object>`
      summary: null, // `<table>`
      text: null, // `<body>`. Use CSS `color` instead
      topMargin: number, // `<body>`
      valueType: null, // `<param>`
      version: null, // `<html>`. Use a doctype.
      vAlign: null, // Several. Use CSS `vertical-align` instead
      vLink: null, // `<body>`. Use CSS `a:visited {color}` instead
      vSpace: number, // `<img>` and `<object>`

      // Non-standard Properties.
      allowTransparency: null,
      autoCorrect: null,
      autoSave: null,
      prefix: null,
      property: null,
      results: number,
      security: null,
      unselectable: null
    }
  })

  },{"./util/case-insensitive-transform":75,"./util/create":77,"./util/types":82}],74:[function(require,module,exports){
  'use strict'

  var types = require('./util/types')
  var create = require('./util/create')
  var caseSensitiveTransform = require('./util/case-sensitive-transform')

  var boolean = types.boolean
  var number = types.number
  var spaceSeparated = types.spaceSeparated
  var commaSeparated = types.commaSeparated
  var commaOrSpaceSeparated = types.commaOrSpaceSeparated

  module.exports = create({
    space: 'svg',
    attributes: {
      accentHeight: 'accent-height',
      alignmentBaseline: 'alignment-baseline',
      arabicForm: 'arabic-form',
      baselineShift: 'baseline-shift',
      capHeight: 'cap-height',
      className: 'class',
      clipPath: 'clip-path',
      clipRule: 'clip-rule',
      colorInterpolation: 'color-interpolation',
      colorInterpolationFilters: 'color-interpolation-filters',
      colorProfile: 'color-profile',
      colorRendering: 'color-rendering',
      crossOrigin: 'crossorigin',
      dataType: 'datatype',
      dominantBaseline: 'dominant-baseline',
      enableBackground: 'enable-background',
      fillOpacity: 'fill-opacity',
      fillRule: 'fill-rule',
      floodColor: 'flood-color',
      floodOpacity: 'flood-opacity',
      fontFamily: 'font-family',
      fontSize: 'font-size',
      fontSizeAdjust: 'font-size-adjust',
      fontStretch: 'font-stretch',
      fontStyle: 'font-style',
      fontVariant: 'font-variant',
      fontWeight: 'font-weight',
      glyphName: 'glyph-name',
      glyphOrientationHorizontal: 'glyph-orientation-horizontal',
      glyphOrientationVertical: 'glyph-orientation-vertical',
      hrefLang: 'hreflang',
      horizAdvX: 'horiz-adv-x',
      horizOriginX: 'horiz-origin-x',
      horizOriginY: 'horiz-origin-y',
      imageRendering: 'image-rendering',
      letterSpacing: 'letter-spacing',
      lightingColor: 'lighting-color',
      markerEnd: 'marker-end',
      markerMid: 'marker-mid',
      markerStart: 'marker-start',
      navDown: 'nav-down',
      navDownLeft: 'nav-down-left',
      navDownRight: 'nav-down-right',
      navLeft: 'nav-left',
      navNext: 'nav-next',
      navPrev: 'nav-prev',
      navRight: 'nav-right',
      navUp: 'nav-up',
      navUpLeft: 'nav-up-left',
      navUpRight: 'nav-up-right',
      overlinePosition: 'overline-position',
      overlineThickness: 'overline-thickness',
      paintOrder: 'paint-order',
      panose1: 'panose-1',
      pointerEvents: 'pointer-events',
      referrerPolicy: 'referrerpolicy',
      renderingIntent: 'rendering-intent',
      shapeRendering: 'shape-rendering',
      stopColor: 'stop-color',
      stopOpacity: 'stop-opacity',
      strikethroughPosition: 'strikethrough-position',
      strikethroughThickness: 'strikethrough-thickness',
      strokeDashArray: 'stroke-dasharray',
      strokeDashOffset: 'stroke-dashoffset',
      strokeLineCap: 'stroke-linecap',
      strokeLineJoin: 'stroke-linejoin',
      strokeMiterLimit: 'stroke-miterlimit',
      strokeOpacity: 'stroke-opacity',
      strokeWidth: 'stroke-width',
      tabIndex: 'tabindex',
      textAnchor: 'text-anchor',
      textDecoration: 'text-decoration',
      textRendering: 'text-rendering',
      typeOf: 'typeof',
      underlinePosition: 'underline-position',
      underlineThickness: 'underline-thickness',
      unicodeBidi: 'unicode-bidi',
      unicodeRange: 'unicode-range',
      unitsPerEm: 'units-per-em',
      vAlphabetic: 'v-alphabetic',
      vHanging: 'v-hanging',
      vIdeographic: 'v-ideographic',
      vMathematical: 'v-mathematical',
      vectorEffect: 'vector-effect',
      vertAdvY: 'vert-adv-y',
      vertOriginX: 'vert-origin-x',
      vertOriginY: 'vert-origin-y',
      wordSpacing: 'word-spacing',
      writingMode: 'writing-mode',
      xHeight: 'x-height',
      // These were camelcased in Tiny. Now lowercased in SVG 2
      playbackOrder: 'playbackorder',
      timelineBegin: 'timelinebegin'
    },
    transform: caseSensitiveTransform,
    properties: {
      about: commaOrSpaceSeparated,
      accentHeight: number,
      accumulate: null,
      additive: null,
      alignmentBaseline: null,
      alphabetic: number,
      amplitude: number,
      arabicForm: null,
      ascent: number,
      attributeName: null,
      attributeType: null,
      azimuth: number,
      bandwidth: null,
      baselineShift: null,
      baseFrequency: null,
      baseProfile: null,
      bbox: null,
      begin: null,
      bias: number,
      by: null,
      calcMode: null,
      capHeight: number,
      className: spaceSeparated,
      clip: null,
      clipPath: null,
      clipPathUnits: null,
      clipRule: null,
      color: null,
      colorInterpolation: null,
      colorInterpolationFilters: null,
      colorProfile: null,
      colorRendering: null,
      content: null,
      contentScriptType: null,
      contentStyleType: null,
      crossOrigin: null,
      cursor: null,
      cx: null,
      cy: null,
      d: null,
      dataType: null,
      defaultAction: null,
      descent: number,
      diffuseConstant: number,
      direction: null,
      display: null,
      dur: null,
      divisor: number,
      dominantBaseline: null,
      download: boolean,
      dx: null,
      dy: null,
      edgeMode: null,
      editable: null,
      elevation: number,
      enableBackground: null,
      end: null,
      event: null,
      exponent: number,
      externalResourcesRequired: null,
      fill: null,
      fillOpacity: number,
      fillRule: null,
      filter: null,
      filterRes: null,
      filterUnits: null,
      floodColor: null,
      floodOpacity: null,
      focusable: null,
      focusHighlight: null,
      fontFamily: null,
      fontSize: null,
      fontSizeAdjust: null,
      fontStretch: null,
      fontStyle: null,
      fontVariant: null,
      fontWeight: null,
      format: null,
      fr: null,
      from: null,
      fx: null,
      fy: null,
      g1: commaSeparated,
      g2: commaSeparated,
      glyphName: commaSeparated,
      glyphOrientationHorizontal: null,
      glyphOrientationVertical: null,
      glyphRef: null,
      gradientTransform: null,
      gradientUnits: null,
      handler: null,
      hanging: number,
      hatchContentUnits: null,
      hatchUnits: null,
      height: null,
      href: null,
      hrefLang: null,
      horizAdvX: number,
      horizOriginX: number,
      horizOriginY: number,
      id: null,
      ideographic: number,
      imageRendering: null,
      initialVisibility: null,
      in: null,
      in2: null,
      intercept: number,
      k: number,
      k1: number,
      k2: number,
      k3: number,
      k4: number,
      kernelMatrix: commaOrSpaceSeparated,
      kernelUnitLength: null,
      keyPoints: null, // SEMI_COLON_SEPARATED
      keySplines: null, // SEMI_COLON_SEPARATED
      keyTimes: null, // SEMI_COLON_SEPARATED
      kerning: null,
      lang: null,
      lengthAdjust: null,
      letterSpacing: null,
      lightingColor: null,
      limitingConeAngle: number,
      local: null,
      markerEnd: null,
      markerMid: null,
      markerStart: null,
      markerHeight: null,
      markerUnits: null,
      markerWidth: null,
      mask: null,
      maskContentUnits: null,
      maskUnits: null,
      mathematical: null,
      max: null,
      media: null,
      mediaCharacterEncoding: null,
      mediaContentEncodings: null,
      mediaSize: number,
      mediaTime: null,
      method: null,
      min: null,
      mode: null,
      name: null,
      navDown: null,
      navDownLeft: null,
      navDownRight: null,
      navLeft: null,
      navNext: null,
      navPrev: null,
      navRight: null,
      navUp: null,
      navUpLeft: null,
      navUpRight: null,
      numOctaves: null,
      observer: null,
      offset: null,
      opacity: null,
      operator: null,
      order: null,
      orient: null,
      orientation: null,
      origin: null,
      overflow: null,
      overlay: null,
      overlinePosition: number,
      overlineThickness: number,
      paintOrder: null,
      panose1: null,
      path: null,
      pathLength: number,
      patternContentUnits: null,
      patternTransform: null,
      patternUnits: null,
      phase: null,
      ping: spaceSeparated,
      pitch: null,
      playbackOrder: null,
      pointerEvents: null,
      points: null,
      pointsAtX: number,
      pointsAtY: number,
      pointsAtZ: number,
      preserveAlpha: null,
      preserveAspectRatio: null,
      primitiveUnits: null,
      propagate: null,
      property: commaOrSpaceSeparated,
      r: null,
      radius: null,
      referrerPolicy: null,
      refX: null,
      refY: null,
      rel: commaOrSpaceSeparated,
      rev: commaOrSpaceSeparated,
      renderingIntent: null,
      repeatCount: null,
      repeatDur: null,
      requiredExtensions: commaOrSpaceSeparated,
      requiredFeatures: commaOrSpaceSeparated,
      requiredFonts: commaOrSpaceSeparated,
      requiredFormats: commaOrSpaceSeparated,
      resource: null,
      restart: null,
      result: null,
      rotate: null,
      rx: null,
      ry: null,
      scale: null,
      seed: null,
      shapeRendering: null,
      side: null,
      slope: null,
      snapshotTime: null,
      specularConstant: number,
      specularExponent: number,
      spreadMethod: null,
      spacing: null,
      startOffset: null,
      stdDeviation: null,
      stemh: null,
      stemv: null,
      stitchTiles: null,
      stopColor: null,
      stopOpacity: null,
      strikethroughPosition: number,
      strikethroughThickness: number,
      string: null,
      stroke: null,
      strokeDashArray: commaOrSpaceSeparated,
      strokeDashOffset: null,
      strokeLineCap: null,
      strokeLineJoin: null,
      strokeMiterLimit: number,
      strokeOpacity: number,
      strokeWidth: null,
      style: null,
      surfaceScale: number,
      syncBehavior: null,
      syncBehaviorDefault: null,
      syncMaster: null,
      syncTolerance: null,
      syncToleranceDefault: null,
      systemLanguage: commaOrSpaceSeparated,
      tabIndex: number,
      tableValues: null,
      target: null,
      targetX: number,
      targetY: number,
      textAnchor: null,
      textDecoration: null,
      textRendering: null,
      textLength: null,
      timelineBegin: null,
      title: null,
      transformBehavior: null,
      type: null,
      typeOf: commaOrSpaceSeparated,
      to: null,
      transform: null,
      u1: null,
      u2: null,
      underlinePosition: number,
      underlineThickness: number,
      unicode: null,
      unicodeBidi: null,
      unicodeRange: null,
      unitsPerEm: number,
      values: null,
      vAlphabetic: number,
      vMathematical: number,
      vectorEffect: null,
      vHanging: number,
      vIdeographic: number,
      version: null,
      vertAdvY: number,
      vertOriginX: number,
      vertOriginY: number,
      viewBox: null,
      viewTarget: null,
      visibility: null,
      width: null,
      widths: null,
      wordSpacing: null,
      writingMode: null,
      x: null,
      x1: null,
      x2: null,
      xChannelSelector: null,
      xHeight: number,
      y: null,
      y1: null,
      y2: null,
      yChannelSelector: null,
      z: null,
      zoomAndPan: null
    }
  })

  },{"./util/case-sensitive-transform":76,"./util/create":77,"./util/types":82}],75:[function(require,module,exports){
  'use strict'

  var caseSensitiveTransform = require('./case-sensitive-transform')

  module.exports = caseInsensitiveTransform

  function caseInsensitiveTransform(attributes, property) {
    return caseSensitiveTransform(attributes, property.toLowerCase())
  }

  },{"./case-sensitive-transform":76}],76:[function(require,module,exports){
  'use strict'

  module.exports = caseSensitiveTransform

  function caseSensitiveTransform(attributes, attribute) {
    return attribute in attributes ? attributes[attribute] : attribute
  }

  },{}],77:[function(require,module,exports){
  'use strict'

  var normalize = require('../../normalize')
  var Schema = require('./schema')
  var DefinedInfo = require('./defined-info')

  module.exports = create

  function create(definition) {
    var space = definition.space
    var mustUseProperty = definition.mustUseProperty || []
    var attributes = definition.attributes || {}
    var props = definition.properties
    var transform = definition.transform
    var property = {}
    var normal = {}
    var prop
    var info

    for (prop in props) {
      info = new DefinedInfo(
        prop,
        transform(attributes, prop),
        props[prop],
        space
      )

      if (mustUseProperty.indexOf(prop) !== -1) {
        info.mustUseProperty = true
      }

      property[prop] = info

      normal[normalize(prop)] = prop
      normal[normalize(info.attribute)] = prop
    }

    return new Schema(property, normal, space)
  }

  },{"../../normalize":86,"./defined-info":78,"./schema":81}],78:[function(require,module,exports){
  'use strict'

  var Info = require('./info')
  var types = require('./types')

  module.exports = DefinedInfo

  DefinedInfo.prototype = new Info()
  DefinedInfo.prototype.defined = true

  function DefinedInfo(property, attribute, mask, space) {
    mark(this, 'space', space)
    Info.call(this, property, attribute)
    mark(this, 'boolean', check(mask, types.boolean))
    mark(this, 'booleanish', check(mask, types.booleanish))
    mark(this, 'overloadedBoolean', check(mask, types.overloadedBoolean))
    mark(this, 'number', check(mask, types.number))
    mark(this, 'commaSeparated', check(mask, types.commaSeparated))
    mark(this, 'spaceSeparated', check(mask, types.spaceSeparated))
    mark(this, 'commaOrSpaceSeparated', check(mask, types.commaOrSpaceSeparated))
  }

  function mark(values, key, value) {
    if (value) {
      values[key] = value
    }
  }

  function check(value, mask) {
    return (value & mask) === mask
  }

  },{"./info":79,"./types":82}],79:[function(require,module,exports){
  'use strict'

  module.exports = Info

  var proto = Info.prototype

  proto.space = null
  proto.attribute = null
  proto.property = null
  proto.boolean = false
  proto.booleanish = false
  proto.overloadedBoolean = false
  proto.number = false
  proto.commaSeparated = false
  proto.spaceSeparated = false
  proto.commaOrSpaceSeparated = false
  proto.mustUseProperty = false
  proto.defined = false

  function Info(property, attribute) {
    this.property = property
    this.attribute = attribute
  }

  },{}],80:[function(require,module,exports){
  'use strict'

  var xtend = require('xtend')
  var Schema = require('./schema')

  module.exports = merge

  function merge(definitions) {
    var length = definitions.length
    var property = []
    var normal = []
    var index = -1
    var info
    var space

    while (++index < length) {
      info = definitions[index]
      property.push(info.property)
      normal.push(info.normal)
      space = info.space
    }

    return new Schema(
      xtend.apply(null, property),
      xtend.apply(null, normal),
      space
    )
  }

  },{"./schema":81,"xtend":110}],81:[function(require,module,exports){
  'use strict'

  module.exports = Schema

  var proto = Schema.prototype

  proto.space = null
  proto.normal = {}
  proto.property = {}

  function Schema(property, normal, space) {
    this.property = property
    this.normal = normal

    if (space) {
      this.space = space
    }
  }

  },{}],82:[function(require,module,exports){
  'use strict'

  var powers = 0

  exports.boolean = increment()
  exports.booleanish = increment()
  exports.overloadedBoolean = increment()
  exports.number = increment()
  exports.spaceSeparated = increment()
  exports.commaSeparated = increment()
  exports.commaOrSpaceSeparated = increment()

  function increment() {
    return Math.pow(2, ++powers)
  }

  },{}],83:[function(require,module,exports){
  'use strict'

  var create = require('./util/create')

  module.exports = create({
    space: 'xlink',
    transform: xlinkTransform,
    properties: {
      xLinkActuate: null,
      xLinkArcRole: null,
      xLinkHref: null,
      xLinkRole: null,
      xLinkShow: null,
      xLinkTitle: null,
      xLinkType: null
    }
  })

  function xlinkTransform(_, prop) {
    return 'xlink:' + prop.slice(5).toLowerCase()
  }

  },{"./util/create":77}],84:[function(require,module,exports){
  'use strict'

  var create = require('./util/create')

  module.exports = create({
    space: 'xml',
    transform: xmlTransform,
    properties: {
      xmlLang: null,
      xmlBase: null,
      xmlSpace: null
    }
  })

  function xmlTransform(_, prop) {
    return 'xml:' + prop.slice(3).toLowerCase()
  }

  },{"./util/create":77}],85:[function(require,module,exports){
  'use strict'

  var create = require('./util/create')
  var caseInsensitiveTransform = require('./util/case-insensitive-transform')

  module.exports = create({
    space: 'xmlns',
    attributes: {
      xmlnsxlink: 'xmlns:xlink'
    },
    transform: caseInsensitiveTransform,
    properties: {
      xmlns: null,
      xmlnsXLink: null
    }
  })

  },{"./util/case-insensitive-transform":75,"./util/create":77}],86:[function(require,module,exports){
  'use strict'

  module.exports = normalize

  function normalize(value) {
    return value.toLowerCase()
  }

  },{}],87:[function(require,module,exports){
  'use strict'

  var merge = require('./lib/util/merge')
  var xlink = require('./lib/xlink')
  var xml = require('./lib/xml')
  var xmlns = require('./lib/xmlns')
  var aria = require('./lib/aria')
  var svg = require('./lib/svg')

  module.exports = merge([xml, xlink, xmlns, aria, svg])

  },{"./lib/aria":72,"./lib/svg":74,"./lib/util/merge":80,"./lib/xlink":83,"./lib/xml":84,"./lib/xmlns":85}],88:[function(require,module,exports){
  /*!
   * repeat-string <https://github.com/jonschlinkert/repeat-string>
   *
   * Copyright (c) 2014-2015, Jon Schlinkert.
   * Licensed under the MIT License.
   */

  'use strict';

  /**
   * Results cache
   */

  var res = '';
  var cache;

  /**
   * Expose `repeat`
   */

  module.exports = repeat;

  /**
   * Repeat the given `string` the specified `number`
   * of times.
   *
   * **Example:**
   *
   * ```js
   * var repeat = require('repeat-string');
   * repeat('A', 5);
   * //=> AAAAA
   * ```
   *
   * @param {String} `string` The string to repeat
   * @param {Number} `number` The number of times to repeat the string
   * @return {String} Repeated string
   * @api public
   */

  function repeat(str, num) {
    if (typeof str !== 'string') {
      throw new TypeError('expected a string');
    }

    // cover common, quick use cases
    if (num === 1) return str;
    if (num === 2) return str + str;

    var max = str.length * num;
    if (cache !== str || typeof cache === 'undefined') {
      cache = str;
      res = '';
    } else if (res.length >= max) {
      return res.substr(0, max);
    }

    while (max > res.length && num > 1) {
      if (num & 1) {
        res += str;
      }

      num >>= 1;
      str += str;
    }

    res += str;
    res = res.substr(0, max);
    return res;
  }

  },{}],89:[function(require,module,exports){
  'use strict';

  var path = require('path');

  function replaceExt(npath, ext) {
    if (typeof npath !== 'string') {
      return npath;
    }

    if (npath.length === 0) {
      return npath;
    }

    var nFileName = path.basename(npath, path.extname(npath)) + ext;
    return path.join(path.dirname(npath), nFileName);
  }

  module.exports = replaceExt;

  },{"path":68}],90:[function(require,module,exports){
  'use strict'

  exports.parse = parse
  exports.stringify = stringify

  var empty = ''
  var space = ' '
  var whiteSpace = /[ \t\n\r\f]+/g

  function parse(value) {
    var input = String(value || empty).trim()
    return input === empty ? [] : input.split(whiteSpace)
  }

  function stringify(values) {
    return values.join(space).trim()
  }

  },{}],91:[function(require,module,exports){
  module.exports=[
    "cent",
    "copy",
    "divide",
    "gt",
    "lt",
    "not",
    "para",
    "times"
  ]

  },{}],92:[function(require,module,exports){
  'use strict'

  var entities = require('character-entities-html4')
  var legacy = require('character-entities-legacy')
  var hexadecimal = require('is-hexadecimal')
  var decimal = require('is-decimal')
  var alphanumerical = require('is-alphanumerical')
  var dangerous = require('./dangerous.json')

  module.exports = encode
  encode.escape = escape

  var own = {}.hasOwnProperty

  // List of enforced escapes.
  var escapes = ['"', "'", '<', '>', '&', '`']

  // Map of characters to names.
  var characters = construct()

  // Default escapes.
  var defaultEscapes = toExpression(escapes)

  // Surrogate pairs.
  var surrogatePair = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g

  // Non-ASCII characters.
  // eslint-disable-next-line no-control-regex, unicorn/no-hex-escape
  var bmp = /[\x01-\t\x0B\f\x0E-\x1F\x7F\x81\x8D\x8F\x90\x9D\xA0-\uFFFF]/g

  // Encode special characters in `value`.
  function encode(value, options) {
    var settings = options || {}
    var subset = settings.subset
    var set = subset ? toExpression(subset) : defaultEscapes
    var escapeOnly = settings.escapeOnly
    var omit = settings.omitOptionalSemicolons

    value = value.replace(set, replace)

    if (subset || escapeOnly) {
      return value
    }

    return value
      .replace(surrogatePair, replaceSurrogatePair)
      .replace(bmp, replace)

    function replaceSurrogatePair(pair, pos, val) {
      return toHexReference(
        (pair.charCodeAt(0) - 0xd800) * 0x400 +
          pair.charCodeAt(1) -
          0xdc00 +
          0x10000,
        val.charAt(pos + 2),
        omit
      )
    }

    function replace(char, pos, val) {
      return one(char, val.charAt(pos + 1), settings)
    }
  }

  // Shortcut to escape special characters in HTML.
  function escape(value) {
    return encode(value, {escapeOnly: true, useNamedReferences: true})
  }

  // Encode `char` according to `options`.
  function one(char, next, options) {
    var shortest = options.useShortestReferences
    var omit = options.omitOptionalSemicolons
    var named
    var code
    var numeric
    var decimal

    if ((shortest || options.useNamedReferences) && own.call(characters, char)) {
      named = toNamed(characters[char], next, omit, options.attribute)
    }

    if (shortest || !named) {
      code = char.charCodeAt(0)
      numeric = toHexReference(code, next, omit)

      // Use the shortest numeric reference when requested.
      // A simple algorithm would use decimal for all code points under 100, as
      // those are shorter than hexadecimal:
      //
      // * `&#99;` vs `&#x63;` (decimal shorter)
      // * `&#100;` vs `&#x64;` (equal)
      //
      // However, because we take `next` into consideration when `omit` is used,
      // And it would be possible that decimals are shorter on bigger values as
      // well if `next` is hexadecimal but not decimal, we instead compare both.
      if (shortest) {
        decimal = toDecimalReference(code, next, omit)

        if (decimal.length < numeric.length) {
          numeric = decimal
        }
      }
    }

    if (named && (!shortest || named.length < numeric.length)) {
      return named
    }

    return numeric
  }

  // Transform `code` into an entity.
  function toNamed(name, next, omit, attribute) {
    var value = '&' + name

    if (
      omit &&
      own.call(legacy, name) &&
      dangerous.indexOf(name) === -1 &&
      (!attribute || (next && next !== '=' && !alphanumerical(next)))
    ) {
      return value
    }

    return value + ';'
  }

  // Transform `code` into a hexadecimal character reference.
  function toHexReference(code, next, omit) {
    var value = '&#x' + code.toString(16).toUpperCase()
    return omit && next && !hexadecimal(next) ? value : value + ';'
  }

  // Transform `code` into a decimal character reference.
  function toDecimalReference(code, next, omit) {
    var value = '&#' + String(code)
    return omit && next && !decimal(next) ? value : value + ';'
  }

  // Create an expression for `characters`.
  function toExpression(characters) {
    return new RegExp('[' + characters.join('') + ']', 'g')
  }

  // Construct the map.
  function construct() {
    var chars = {}
    var name

    for (name in entities) {
      chars[entities[name]] = name
    }

    return chars
  }

  },{"./dangerous.json":91,"character-entities-html4":47,"character-entities-legacy":48,"is-alphanumerical":62,"is-decimal":64,"is-hexadecimal":65}],93:[function(require,module,exports){
  'use strict'

  var wrap = require('./wrap.js')

  module.exports = trough

  trough.wrap = wrap

  var slice = [].slice

  // Create new middleware.
  function trough() {
    var fns = []
    var middleware = {}

    middleware.run = run
    middleware.use = use

    return middleware

    // Run `fns`.  Last argument must be a completion handler.
    function run() {
      var index = -1
      var input = slice.call(arguments, 0, -1)
      var done = arguments[arguments.length - 1]

      if (typeof done !== 'function') {
        throw new Error('Expected function as last argument, not ' + done)
      }

      next.apply(null, [null].concat(input))

      // Run the next `fn`, if any.
      function next(err) {
        var fn = fns[++index]
        var params = slice.call(arguments, 0)
        var values = params.slice(1)
        var length = input.length
        var pos = -1

        if (err) {
          done(err)
          return
        }

        // Copy non-nully input into values.
        while (++pos < length) {
          if (values[pos] === null || values[pos] === undefined) {
            values[pos] = input[pos]
          }
        }

        input = values

        // Next or done.
        if (fn) {
          wrap(fn, next).apply(null, input)
        } else {
          done.apply(null, [null].concat(input))
        }
      }
    }

    // Add `fn` to the list.
    function use(fn) {
      if (typeof fn !== 'function') {
        throw new Error('Expected `fn` to be a function, not ' + fn)
      }

      fns.push(fn)

      return middleware
    }
  }

  },{"./wrap.js":94}],94:[function(require,module,exports){
  'use strict'

  var slice = [].slice

  module.exports = wrap

  // Wrap `fn`.
  // Can be sync or async; return a promise, receive a completion handler, return
  // new values and errors.
  function wrap(fn, callback) {
    var invoked

    return wrapped

    function wrapped() {
      var params = slice.call(arguments, 0)
      var callback = fn.length > params.length
      var result

      if (callback) {
        params.push(done)
      }

      try {
        result = fn.apply(null, params)
      } catch (error) {
        // Well, this is quite the pickle.
        // `fn` received a callback and invoked it (thus continuing the pipeline),
        // but later also threw an error.
        // We’re not about to restart the pipeline again, so the only thing left
        // to do is to throw the thing instead.
        if (callback && invoked) {
          throw error
        }

        return done(error)
      }

      if (!callback) {
        if (result && typeof result.then === 'function') {
          result.then(then, done)
        } else if (result instanceof Error) {
          done(result)
        } else {
          then(result)
        }
      }
    }

    // Invoke `next`, only once.
    function done() {
      if (!invoked) {
        invoked = true

        callback.apply(null, arguments)
      }
    }

    // Invoke `done` with one value.
    // Tracks if an error is passed, too.
    function then(value) {
      done(null, value)
    }
  }

  },{}],95:[function(require,module,exports){
  (function (process){
  'use strict'

  var extend = require('extend')
  var bail = require('bail')
  var vfile = require('vfile')
  var trough = require('trough')
  var string = require('x-is-string')
  var plain = require('is-plain-obj')

  // Expose a frozen processor.
  module.exports = unified().freeze()

  var slice = [].slice
  var own = {}.hasOwnProperty

  // Process pipeline.
  var pipeline = trough()
    .use(pipelineParse)
    .use(pipelineRun)
    .use(pipelineStringify)

  function pipelineParse(p, ctx) {
    ctx.tree = p.parse(ctx.file)
  }

  function pipelineRun(p, ctx, next) {
    p.run(ctx.tree, ctx.file, done)

    function done(err, tree, file) {
      if (err) {
        next(err)
      } else {
        ctx.tree = tree
        ctx.file = file
        next()
      }
    }
  }

  function pipelineStringify(p, ctx) {
    ctx.file.contents = p.stringify(ctx.tree, ctx.file)
  }

  // Function to create the first processor.
  function unified() {
    var attachers = []
    var transformers = trough()
    var namespace = {}
    var frozen = false
    var freezeIndex = -1

    // Data management.
    processor.data = data

    // Lock.
    processor.freeze = freeze

    // Plugins.
    processor.attachers = attachers
    processor.use = use

    // API.
    processor.parse = parse
    processor.stringify = stringify
    processor.run = run
    processor.runSync = runSync
    processor.process = process
    processor.processSync = processSync

    // Expose.
    return processor

    // Create a new processor based on the processor in the current scope.
    function processor() {
      var destination = unified()
      var length = attachers.length
      var index = -1

      while (++index < length) {
        destination.use.apply(null, attachers[index])
      }

      destination.data(extend(true, {}, namespace))

      return destination
    }

    // Freeze: used to signal a processor that has finished configuration.
    //
    // For example, take unified itself.  It’s frozen.  Plugins should not be
    // added to it.  Rather, it should be extended, by invoking it, before
    // modifying it.
    //
    // In essence, always invoke this when exporting a processor.
    function freeze() {
      var values
      var plugin
      var options
      var transformer

      if (frozen) {
        return processor
      }

      while (++freezeIndex < attachers.length) {
        values = attachers[freezeIndex]
        plugin = values[0]
        options = values[1]
        transformer = null

        if (options === false) {
          continue
        }

        if (options === true) {
          values[1] = undefined
        }

        transformer = plugin.apply(processor, values.slice(1))

        if (typeof transformer === 'function') {
          transformers.use(transformer)
        }
      }

      frozen = true
      freezeIndex = Infinity

      return processor
    }

    // Data management.  Getter / setter for processor-specific informtion.
    function data(key, value) {
      if (string(key)) {
        // Set `key`.
        if (arguments.length === 2) {
          assertUnfrozen('data', frozen)

          namespace[key] = value

          return processor
        }

        // Get `key`.
        return (own.call(namespace, key) && namespace[key]) || null
      }

      // Set space.
      if (key) {
        assertUnfrozen('data', frozen)
        namespace = key
        return processor
      }

      // Get space.
      return namespace
    }

    // Plugin management.
    //
    // Pass it:
    // *   an attacher and options,
    // *   a preset,
    // *   a list of presets, attachers, and arguments (list of attachers and
    //     options).
    function use(value) {
      var settings

      assertUnfrozen('use', frozen)

      if (value === null || value === undefined) {
        // Empty.
      } else if (typeof value === 'function') {
        addPlugin.apply(null, arguments)
      } else if (typeof value === 'object') {
        if ('length' in value) {
          addList(value)
        } else {
          addPreset(value)
        }
      } else {
        throw new Error('Expected usable value, not `' + value + '`')
      }

      if (settings) {
        namespace.settings = extend(namespace.settings || {}, settings)
      }

      return processor

      function addPreset(result) {
        addList(result.plugins)

        if (result.settings) {
          settings = extend(settings || {}, result.settings)
        }
      }

      function add(value) {
        if (typeof value === 'function') {
          addPlugin(value)
        } else if (typeof value === 'object') {
          if ('length' in value) {
            addPlugin.apply(null, value)
          } else {
            addPreset(value)
          }
        } else {
          throw new Error('Expected usable value, not `' + value + '`')
        }
      }

      function addList(plugins) {
        var length
        var index

        if (plugins === null || plugins === undefined) {
          // Empty.
        } else if (typeof plugins === 'object' && 'length' in plugins) {
          length = plugins.length
          index = -1

          while (++index < length) {
            add(plugins[index])
          }
        } else {
          throw new Error('Expected a list of plugins, not `' + plugins + '`')
        }
      }

      function addPlugin(plugin, value) {
        var entry = find(plugin)

        if (entry) {
          if (plain(entry[1]) && plain(value)) {
            value = extend(entry[1], value)
          }

          entry[1] = value
        } else {
          attachers.push(slice.call(arguments))
        }
      }
    }

    function find(plugin) {
      var length = attachers.length
      var index = -1
      var entry

      while (++index < length) {
        entry = attachers[index]

        if (entry[0] === plugin) {
          return entry
        }
      }
    }

    // Parse a file (in string or vfile representation) into a unist node using
    // the `Parser` on the processor.
    function parse(doc) {
      var file = vfile(doc)
      var Parser

      freeze()
      Parser = processor.Parser
      assertParser('parse', Parser)

      if (newable(Parser)) {
        return new Parser(String(file), file).parse()
      }

      return Parser(String(file), file) // eslint-disable-line new-cap
    }

    // Run transforms on a unist node representation of a file (in string or
    // vfile representation), async.
    function run(node, file, cb) {
      assertNode(node)
      freeze()

      if (!cb && typeof file === 'function') {
        cb = file
        file = null
      }

      if (!cb) {
        return new Promise(executor)
      }

      executor(null, cb)

      function executor(resolve, reject) {
        transformers.run(node, vfile(file), done)

        function done(err, tree, file) {
          tree = tree || node
          if (err) {
            reject(err)
          } else if (resolve) {
            resolve(tree)
          } else {
            cb(null, tree, file)
          }
        }
      }
    }

    // Run transforms on a unist node representation of a file (in string or
    // vfile representation), sync.
    function runSync(node, file) {
      var complete = false
      var result

      run(node, file, done)

      assertDone('runSync', 'run', complete)

      return result

      function done(err, tree) {
        complete = true
        bail(err)
        result = tree
      }
    }

    // Stringify a unist node representation of a file (in string or vfile
    // representation) into a string using the `Compiler` on the processor.
    function stringify(node, doc) {
      var file = vfile(doc)
      var Compiler

      freeze()
      Compiler = processor.Compiler
      assertCompiler('stringify', Compiler)
      assertNode(node)

      if (newable(Compiler)) {
        return new Compiler(node, file).compile()
      }

      return Compiler(node, file) // eslint-disable-line new-cap
    }

    // Parse a file (in string or vfile representation) into a unist node using
    // the `Parser` on the processor, then run transforms on that node, and
    // compile the resulting node using the `Compiler` on the processor, and
    // store that result on the vfile.
    function process(doc, cb) {
      freeze()
      assertParser('process', processor.Parser)
      assertCompiler('process', processor.Compiler)

      if (!cb) {
        return new Promise(executor)
      }

      executor(null, cb)

      function executor(resolve, reject) {
        var file = vfile(doc)

        pipeline.run(processor, {file: file}, done)

        function done(err) {
          if (err) {
            reject(err)
          } else if (resolve) {
            resolve(file)
          } else {
            cb(null, file)
          }
        }
      }
    }

    // Process the given document (in string or vfile representation), sync.
    function processSync(doc) {
      var complete = false
      var file

      freeze()
      assertParser('processSync', processor.Parser)
      assertCompiler('processSync', processor.Compiler)
      file = vfile(doc)

      process(file, done)

      assertDone('processSync', 'process', complete)

      return file

      function done(err) {
        complete = true
        bail(err)
      }
    }
  }

  // Check if `func` is a constructor.
  function newable(value) {
    return typeof value === 'function' && keys(value.prototype)
  }

  // Check if `value` is an object with keys.
  function keys(value) {
    var key
    for (key in value) {
      return true
    }
    return false
  }

  // Assert a parser is available.
  function assertParser(name, Parser) {
    if (typeof Parser !== 'function') {
      throw new Error('Cannot `' + name + '` without `Parser`')
    }
  }

  // Assert a compiler is available.
  function assertCompiler(name, Compiler) {
    if (typeof Compiler !== 'function') {
      throw new Error('Cannot `' + name + '` without `Compiler`')
    }
  }

  // Assert the processor is not frozen.
  function assertUnfrozen(name, frozen) {
    if (frozen) {
      throw new Error(
        'Cannot invoke `' +
          name +
          '` on a frozen processor.\nCreate a new processor first, by invoking it: use `processor()` instead of `processor`.'
      )
    }
  }

  // Assert `node` is a unist node.
  function assertNode(node) {
    if (!node || !string(node.type)) {
      throw new Error('Expected node, got `' + node + '`')
    }
  }

  // Assert that `complete` is `true`.
  function assertDone(name, asyncName, complete) {
    if (!complete) {
      throw new Error(
        '`' + name + '` finished async. Use `' + asyncName + '` instead'
      )
    }
  }

  }).call(this,require('_process'))
  },{"_process":69,"bail":45,"extend":51,"is-plain-obj":66,"trough":93,"vfile":97,"x-is-string":109}],96:[function(require,module,exports){
  (function (process){
  'use strict'

  var path = require('path')
  var replace = require('replace-ext')
  var buffer = require('is-buffer')

  module.exports = VFile

  var own = {}.hasOwnProperty
  var proto = VFile.prototype

  proto.toString = toString

  // Order of setting (least specific to most), we need this because otherwise
  // `{stem: 'a', path: '~/b.js'}` would throw, as a path is needed before a
  // stem can be set.
  var order = ['history', 'path', 'basename', 'stem', 'extname', 'dirname']

  // Construct a new file.
  function VFile(options) {
    var prop
    var index
    var length

    if (!options) {
      options = {}
    } else if (typeof options === 'string' || buffer(options)) {
      options = {contents: options}
    } else if ('message' in options && 'messages' in options) {
      return options
    }

    if (!(this instanceof VFile)) {
      return new VFile(options)
    }

    this.data = {}
    this.messages = []
    this.history = []
    this.cwd = process.cwd()

    // Set path related properties in the correct order.
    index = -1
    length = order.length

    while (++index < length) {
      prop = order[index]

      if (own.call(options, prop)) {
        this[prop] = options[prop]
      }
    }

    // Set non-path related properties.
    for (prop in options) {
      if (order.indexOf(prop) === -1) {
        this[prop] = options[prop]
      }
    }
  }

  // Access full path (`~/index.min.js`).
  Object.defineProperty(proto, 'path', {
    get: function() {
      return this.history[this.history.length - 1]
    },
    set: function(path) {
      assertNonEmpty(path, 'path')

      if (path !== this.path) {
        this.history.push(path)
      }
    }
  })

  // Access parent path (`~`).
  Object.defineProperty(proto, 'dirname', {
    get: function() {
      return typeof this.path === 'string' ? path.dirname(this.path) : undefined
    },
    set: function(dirname) {
      assertPath(this.path, 'dirname')
      this.path = path.join(dirname || '', this.basename)
    }
  })

  // Access basename (`index.min.js`).
  Object.defineProperty(proto, 'basename', {
    get: function() {
      return typeof this.path === 'string' ? path.basename(this.path) : undefined
    },
    set: function(basename) {
      assertNonEmpty(basename, 'basename')
      assertPart(basename, 'basename')
      this.path = path.join(this.dirname || '', basename)
    }
  })

  // Access extname (`.js`).
  Object.defineProperty(proto, 'extname', {
    get: function() {
      return typeof this.path === 'string' ? path.extname(this.path) : undefined
    },
    set: function(extname) {
      var ext = extname || ''

      assertPart(ext, 'extname')
      assertPath(this.path, 'extname')

      if (ext) {
        if (ext.charAt(0) !== '.') {
          throw new Error('`extname` must start with `.`')
        }

        if (ext.indexOf('.', 1) !== -1) {
          throw new Error('`extname` cannot contain multiple dots')
        }
      }

      this.path = replace(this.path, ext)
    }
  })

  // Access stem (`index.min`).
  Object.defineProperty(proto, 'stem', {
    get: function() {
      return typeof this.path === 'string'
        ? path.basename(this.path, this.extname)
        : undefined
    },
    set: function(stem) {
      assertNonEmpty(stem, 'stem')
      assertPart(stem, 'stem')
      this.path = path.join(this.dirname || '', stem + (this.extname || ''))
    }
  })

  // Get the value of the file.
  function toString(encoding) {
    var value = this.contents || ''
    return buffer(value) ? value.toString(encoding) : String(value)
  }

  // Assert that `part` is not a path (i.e., does not contain `path.sep`).
  function assertPart(part, name) {
    if (part.indexOf(path.sep) !== -1) {
      throw new Error(
        '`' + name + '` cannot be a path: did not expect `' + path.sep + '`'
      )
    }
  }

  // Assert that `part` is not empty.
  function assertNonEmpty(part, name) {
    if (!part) {
      throw new Error('`' + name + '` cannot be empty')
    }
  }

  // Assert `path` exists.
  function assertPath(path, name) {
    if (!path) {
      throw new Error('Setting `' + name + '` requires `path` to be set too')
    }
  }

  }).call(this,require('_process'))
  },{"_process":69,"is-buffer":63,"path":68,"replace-ext":89}],97:[function(require,module,exports){
  'use strict'

  var VMessage = require('vfile-message')
  var VFile = require('./core.js')

  module.exports = VFile

  var proto = VFile.prototype

  proto.message = message
  proto.info = info
  proto.fail = fail

  // Slight backwards compatibility.  Remove in the future.
  proto.warn = message

  // Create a message with `reason` at `position`.  When an error is passed in as
  // `reason`, copies the stack.
  function message(reason, position, origin) {
    var filePath = this.path
    var message = new VMessage(reason, position, origin)

    if (filePath) {
      message.name = filePath + ':' + message.name
      message.file = filePath
    }

    message.fatal = false

    this.messages.push(message)

    return message
  }

  // Fail.  Creates a vmessage, associates it with the file, and throws it.
  function fail() {
    var message = this.message.apply(this, arguments)

    message.fatal = true

    throw message
  }

  // Info.  Creates a vmessage, associates it with the file, and marks the
  // fatality as null.
  function info() {
    var message = this.message.apply(this, arguments)

    message.fatal = null

    return message
  }

  },{"./core.js":96,"vfile-message":104}],98:[function(require,module,exports){
  /**
   * @author Richard Smith-Unna
   * @copyright 2016 Richard Smith-Unnar
   * @license MIT
   * @module unist:find
   * @fileoverview Unist node finder
   */

  'use strict'

  var visit = require('unist-util-visit')
  var iteratee = require('lodash.iteratee')

  /**
   * Find
   *
   * @param {Node} tree - Root node
   * @param {string|object|function} [condition] - Condition to match node.
   */
  function find (tree, condition) {
    if (!tree) throw new Error('unist-find requires a tree to search')
    if (!condition) throw new Error('unist-find requires a condition')

    var predicate = iteratee(condition)
    var result

    visit(tree, function (node) {
      if (predicate(node)) {
        result = node
        return false
      }
    })

    return result
  }

  /*
   * Expose.
   */
  module.exports = find

  },{"lodash.iteratee":67,"unist-util-visit":103}],99:[function(require,module,exports){
  'use strict'

  module.exports = is

  // Assert if `test` passes for `node`.   When a `parent` node is known the
  // `index` of node.
  // eslint-disable-next-line max-params
  function is(test, node, index, parent, context) {
    var hasParent = parent !== null && parent !== undefined
    var hasIndex = index !== null && index !== undefined
    var check = convert(test)

    if (
      hasIndex &&
      (typeof index !== 'number' || index < 0 || index === Infinity)
    ) {
      throw new Error('Expected positive finite index or child node')
    }

    if (hasParent && (!is(null, parent) || !parent.children)) {
      throw new Error('Expected parent node')
    }

    if (!node || !node.type || typeof node.type !== 'string') {
      return false
    }

    if (hasParent !== hasIndex) {
      throw new Error('Expected both parent and index')
    }

    return Boolean(check.call(context, node, index, parent))
  }

  function convert(test) {
    if (typeof test === 'string') {
      return typeFactory(test)
    }

    if (test === null || test === undefined) {
      return ok
    }

    if (typeof test === 'object') {
      return ('length' in test ? anyFactory : matchesFactory)(test)
    }

    if (typeof test === 'function') {
      return test
    }

    throw new Error('Expected function, string, or object as test')
  }

  function convertAll(tests) {
    var results = []
    var length = tests.length
    var index = -1

    while (++index < length) {
      results[index] = convert(tests[index])
    }

    return results
  }

  // Utility assert each property in `test` is represented in `node`, and each
  // values are strictly equal.
  function matchesFactory(test) {
    return matches

    function matches(node) {
      var key

      for (key in test) {
        if (node[key] !== test[key]) {
          return false
        }
      }

      return true
    }
  }

  function anyFactory(tests) {
    var checks = convertAll(tests)
    var length = checks.length

    return matches

    function matches() {
      var index = -1

      while (++index < length) {
        if (checks[index].apply(this, arguments)) {
          return true
        }
      }

      return false
    }
  }

  // Utility to convert a string into a function which checks a given node’s type
  // for said string.
  function typeFactory(test) {
    return type

    function type(node) {
      return Boolean(node && node.type === test)
    }
  }

  // Utility to return true.
  function ok() {
    return true
  }

  },{}],100:[function(require,module,exports){
  'use strict'

  var iterate = require('array-iterate')

  module.exports = modifierFactory

  // Turn `callback` into a child-modifier accepting a parent.  See
  // `array-iterate` for more info.
  function modifierFactory(callback) {
    return iteratorFactory(wrapperFactory(callback))
  }

  // Turn `callback` into a `iterator' accepting a parent.
  function iteratorFactory(callback) {
    return iterator

    function iterator(parent) {
      var children = parent && parent.children

      if (!children) {
        throw new Error('Missing children in `parent` for `modifier`')
      }

      return iterate(children, callback, parent)
    }
  }

  // Pass the context as the third argument to `callback`.
  function wrapperFactory(callback) {
    return wrapper

    function wrapper(value, index) {
      return callback(value, index, this)
    }
  }

  },{"array-iterate":44}],101:[function(require,module,exports){
  'use strict'

  var own = {}.hasOwnProperty

  module.exports = stringify

  function stringify(value) {
    /* Nothing. */
    if (!value || typeof value !== 'object') {
      return null
    }

    /* Node. */
    if (own.call(value, 'position') || own.call(value, 'type')) {
      return position(value.position)
    }

    /* Position. */
    if (own.call(value, 'start') || own.call(value, 'end')) {
      return position(value)
    }

    /* Point. */
    if (own.call(value, 'line') || own.call(value, 'column')) {
      return point(value)
    }

    /* ? */
    return null
  }

  function point(point) {
    if (!point || typeof point !== 'object') {
      point = {}
    }

    return index(point.line) + ':' + index(point.column)
  }

  function position(pos) {
    if (!pos || typeof pos !== 'object') {
      pos = {}
    }

    return point(pos.start) + '-' + point(pos.end)
  }

  function index(value) {
    return value && typeof value === 'number' ? value : 1
  }

  },{}],102:[function(require,module,exports){
  'use strict'

  module.exports = visitParents

  var is = require('unist-util-is')

  var CONTINUE = true
  var SKIP = 'skip'
  var EXIT = false

  visitParents.CONTINUE = CONTINUE
  visitParents.SKIP = SKIP
  visitParents.EXIT = EXIT

  function visitParents(tree, test, visitor, reverse) {
    if (typeof test === 'function' && typeof visitor !== 'function') {
      reverse = visitor
      visitor = test
      test = null
    }

    one(tree, null, [])

    // Visit a single node.
    function one(node, index, parents) {
      var result = []
      var subresult

      if (!test || is(test, node, index, parents[parents.length - 1] || null)) {
        result = toResult(visitor(node, parents))

        if (result[0] === EXIT) {
          return result
        }
      }

      if (node.children && result[0] !== SKIP) {
        subresult = toResult(all(node.children, parents.concat(node)))
        return subresult[0] === EXIT ? subresult : result
      }

      return result
    }

    // Visit children in `parent`.
    function all(children, parents) {
      var min = -1
      var step = reverse ? -1 : 1
      var index = (reverse ? children.length : min) + step
      var result

      while (index > min && index < children.length) {
        result = one(children[index], index, parents)

        if (result[0] === EXIT) {
          return result
        }

        index = typeof result[1] === 'number' ? result[1] : index + step
      }
    }
  }

  function toResult(value) {
    if (value !== null && typeof value === 'object' && 'length' in value) {
      return value
    }

    if (typeof value === 'number') {
      return [CONTINUE, value]
    }

    return [value]
  }

  },{"unist-util-is":99}],103:[function(require,module,exports){
  'use strict'

  module.exports = visit

  var visitParents = require('unist-util-visit-parents')

  var CONTINUE = visitParents.CONTINUE
  var SKIP = visitParents.SKIP
  var EXIT = visitParents.EXIT

  visit.CONTINUE = CONTINUE
  visit.SKIP = SKIP
  visit.EXIT = EXIT

  function visit(tree, test, visitor, reverse) {
    if (typeof test === 'function' && typeof visitor !== 'function') {
      reverse = visitor
      visitor = test
      test = null
    }

    visitParents(tree, test, overload, reverse)

    function overload(node, parents) {
      var parent = parents[parents.length - 1]
      var index = parent ? parent.children.indexOf(node) : null
      return visitor(node, index, parent)
    }
  }

  },{"unist-util-visit-parents":102}],104:[function(require,module,exports){
  'use strict'

  var stringify = require('unist-util-stringify-position')

  module.exports = VMessage

  // Inherit from `Error#`.
  function VMessagePrototype() {}
  VMessagePrototype.prototype = Error.prototype
  VMessage.prototype = new VMessagePrototype()

  // Message properties.
  var proto = VMessage.prototype

  proto.file = ''
  proto.name = ''
  proto.reason = ''
  proto.message = ''
  proto.stack = ''
  proto.fatal = null
  proto.column = null
  proto.line = null

  // Construct a new VMessage.
  //
  // Note: We cannot invoke `Error` on the created context, as that adds readonly
  // `line` and `column` attributes on Safari 9, thus throwing and failing the
  // data.
  function VMessage(reason, position, origin) {
    var parts
    var range
    var location

    if (typeof position === 'string') {
      origin = position
      position = null
    }

    parts = parseOrigin(origin)
    range = stringify(position) || '1:1'

    location = {
      start: {line: null, column: null},
      end: {line: null, column: null}
    }

    // Node.
    if (position && position.position) {
      position = position.position
    }

    if (position) {
      // Position.
      if (position.start) {
        location = position
        position = position.start
      } else {
        // Point.
        location.start = position
      }
    }

    if (reason.stack) {
      this.stack = reason.stack
      reason = reason.message
    }

    this.message = reason
    this.name = range
    this.reason = reason
    this.line = position ? position.line : null
    this.column = position ? position.column : null
    this.location = location
    this.source = parts[0]
    this.ruleId = parts[1]
  }

  function parseOrigin(origin) {
    var result = [null, null]
    var index

    if (typeof origin === 'string') {
      index = origin.indexOf(':')

      if (index === -1) {
        result[1] = origin
      } else {
        result[0] = origin.slice(0, index)
        result[1] = origin.slice(index + 1)
      }
    }

    return result
  }

  },{"unist-util-stringify-position":101}],105:[function(require,module,exports){
  arguments[4][96][0].apply(exports,arguments)
  },{"_process":69,"dup":96,"is-buffer":63,"path":68,"replace-ext":89}],106:[function(require,module,exports){
  'use strict'

  var VMessage = require('vfile-message')
  var VFile = require('./core.js')

  module.exports = VFile

  var proto = VFile.prototype

  proto.message = message
  proto.info = info
  proto.fail = fail

  // Create a message with `reason` at `position`.  When an error is passed in as
  // `reason`, copies the stack.
  function message(reason, position, origin) {
    var filePath = this.path
    var message = new VMessage(reason, position, origin)

    if (filePath) {
      message.name = filePath + ':' + message.name
      message.file = filePath
    }

    message.fatal = false

    this.messages.push(message)

    return message
  }

  // Fail.  Creates a vmessage, associates it with the file, and throws it.
  function fail() {
    var message = this.message.apply(this, arguments)

    message.fatal = true

    throw message
  }

  // Info.  Creates a vmessage, associates it with the file, and marks the
  // fatality as null.
  function info() {
    var message = this.message.apply(this, arguments)

    message.fatal = null

    return message
  }

  },{"./core.js":105,"vfile-message":107}],107:[function(require,module,exports){
  arguments[4][104][0].apply(exports,arguments)
  },{"dup":104,"unist-util-stringify-position":108}],108:[function(require,module,exports){
  arguments[4][101][0].apply(exports,arguments)
  },{"dup":101}],109:[function(require,module,exports){
  var toString = Object.prototype.toString

  module.exports = isString

  function isString(obj) {
      return toString.call(obj) === "[object String]"
  }

  },{}],110:[function(require,module,exports){
  module.exports = extend

  var hasOwnProperty = Object.prototype.hasOwnProperty;

  function extend() {
      var target = {}

      for (var i = 0; i < arguments.length; i++) {
          var source = arguments[i]

          for (var key in source) {
              if (hasOwnProperty.call(source, key)) {
                  target[key] = source[key]
              }
          }
      }

      return target
  }

  },{}]},{},[28])(28)
  });
