/**
 * ESLint rule: no-raw-tailwind-colors
 *
 * Prevents usage of default Tailwind CSS palette colors (e.g., text-red-500,
 * bg-gray-200, border-white) in favor of design system token classes.
 *
 * Correct usage examples:
 *   - text-text-primary, text-text-secondary, text-text-tertiary
 *   - bg-surface, bg-card, bg-interactive-fill, bg-interactive-hover
 *   - border-border, border-interactive-focus
 *   - text-h1, text-h2, text-body, text-label (typography utilities)
 *
 * The rule inspects string literals and template literal quasis commonly used
 * in className, cn(), cva(), and similar utility function calls.
 */

// Default Tailwind palette color names to forbid
var PALETTE_COLORS = [
  'white', 'black',
  'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink',
  'gray', 'slate', 'zinc', 'neutral', 'stone',
  'amber', 'lime', 'emerald', 'teal', 'cyan', 'sky',
  'indigo', 'violet', 'fuchsia', 'rose',
];

// CSS property prefixes that use colors
var COLOR_PREFIXES = [
  'text', 'bg', 'border', 'ring', 'shadow', 'outline',
  'divide', 'accent', 'caret', 'fill', 'stroke', 'decoration',
  'from', 'via', 'to',
  'placeholder',
];

// Build the regex pattern dynamically
var colorJoin = PALETTE_COLORS.join('|');
var prefixJoin = COLOR_PREFIXES.join('|');

// Build pattern as a plain string to avoid template literal backtick issues.
// Matches: bg-red-500, hover:text-white, dark:sm:border-gray-200/50, etc.
// The pattern captures the full class including optional variant prefixes.
var patternStr = '(?:^|[\\s"\'])' +
  '((?:[a-z0-9-]+:)*)' +
  '(' + prefixJoin + ')-' +
  '(' + colorJoin + ')' +
  '(-\\d{1,4})?' +
  '(\\/\\d{1,3})?' +
  '(?=[\\s"\'\\x60]|$)';

var RAW_COLOR_PATTERN_GLOBAL = new RegExp(patternStr, 'g');

/**
 * Check a string value for raw Tailwind color usage.
 * Returns an array of found violations (the matched class name strings).
 */
function findViolations(value) {
  if (typeof value !== 'string') return [];

  var violations = [];
  var match;

  // Reset lastIndex for global regex
  RAW_COLOR_PATTERN_GLOBAL.lastIndex = 0;

  while ((match = RAW_COLOR_PATTERN_GLOBAL.exec(value)) !== null) {
    // Reconstruct the full class name from captured groups
    var variants = match[1] || '';
    var prefix = match[2];
    var color = match[3];
    var shade = match[4] || '';
    var opacity = match[5] || '';
    var className = variants + prefix + '-' + color + shade + opacity;
    violations.push(className);
  }

  return violations;
}

var MESSAGE =
  'Avoid raw Tailwind palette color "{{className}}". ' +
  'Use design system tokens instead (e.g., text-text-primary, bg-surface, border-border). ' +
  'If this is intentional (e.g., bg-black for a video player), add an eslint-disable comment.';

/**
 * Checks whether a node is in a className-related context:
 * - JSX className attribute
 * - Argument to cn(), clsx(), cva(), twMerge(), or similar
 */
function isClassNameContext(node) {
  // Direct className attribute: className="..."
  if (
    node.parent &&
    node.parent.type === 'JSXAttribute' &&
    node.parent.name &&
    node.parent.name.name === 'className'
  ) {
    return true;
  }

  // Inside JSX expression container in className: className={...}
  if (
    node.parent &&
    node.parent.type === 'JSXExpressionContainer' &&
    node.parent.parent &&
    node.parent.parent.type === 'JSXAttribute' &&
    node.parent.parent.name &&
    node.parent.parent.name.name === 'className'
  ) {
    return true;
  }

  // Walk up the AST looking for cn/clsx/cva calls or className attributes
  var current = node.parent;
  while (current) {
    if (current.type === 'CallExpression') {
      var callee = current.callee;
      var name = null;
      if (callee.type === 'Identifier') {
        name = callee.name;
      } else if (callee.type === 'MemberExpression' && callee.property) {
        name = callee.property.name;
      }
      if (name && /^(cn|clsx|cva|twMerge|twJoin|classNames|classnames)$/.test(name)) {
        return true;
      }
    }
    // Check if inside a className JSX attribute via expression container
    if (
      current.type === 'JSXExpressionContainer' &&
      current.parent &&
      current.parent.type === 'JSXAttribute' &&
      current.parent.name &&
      current.parent.name.name === 'className'
    ) {
      return true;
    }
    current = current.parent;
  }

  return false;
}

var rule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow raw Tailwind CSS palette colors in favor of design system tokens',
      recommended: true,
    },
    messages: {
      noRawColor: MESSAGE,
    },
    schema: [],
  },

  create: function create(context) {
    function checkStringValue(node, value) {
      if (!isClassNameContext(node)) return;

      var violations = findViolations(value);
      for (var i = 0; i < violations.length; i++) {
        context.report({
          node: node,
          messageId: 'noRawColor',
          data: { className: violations[i] },
        });
      }
    }

    return {
      // String literals: className="text-red-500"
      Literal: function(node) {
        if (typeof node.value === 'string') {
          checkStringValue(node, node.value);
        }
      },

      // Template literal parts: className={`text-red-500 ${x}`}
      TemplateLiteral: function(node) {
        for (var i = 0; i < node.quasis.length; i++) {
          var quasi = node.quasis[i];
          if (quasi.value && quasi.value.raw) {
            checkStringValue(node, quasi.value.raw);
          }
        }
      },
    };
  },
};

export default rule;
