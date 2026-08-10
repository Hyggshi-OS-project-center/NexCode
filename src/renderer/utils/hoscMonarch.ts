import type { languages } from 'monaco-editor';

export const hoscLanguageDef: languages.LanguageConfiguration = {
  comments: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
  },
  brackets: [
    ['{', '}'],
    ['[', ']'],
    ['(', ')'],
  ],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: '`', close: '`' },
  ],
  surroundingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
    { open: '`', close: '`' },
  ],
};

export const hoscMonarchTokens: languages.IMonarchLanguage = {
  defaultToken: '',
  tokenPostfix: '.hosc',

  keywords: [
    'package',
    'import',
    'func',
    'if',
    'else',
    'while',
    'for',
    'switch',
    'case',
    'default',
    'return',
    'break',
    'continue',
    'var',
    'let',
    'const',
    'window',
    'text',
    'print',
    'prints',
  ],

  operators: [
    '=',
    '>',
    '<',
    '!',
    '==',
    '<=',
    '>=',
    '!=',
    '&&',
    '||',
    '+',
    '-',
    '*',
    '/',
    '%',
  ],

  symbols: /[=><!~?:&|+\-*\/\^%]+/,
  escapes: /\\(?:[abfnrtv\\"']|x[0-9A-Fa-f]{1,4}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8})/,

  tokenizer: {
    root: [
      // Identifiers and keywords
      [
        /[a-zA-Z_][a-zA-Z0-9_]*/,
        {
          cases: {
            'true|false': 'keyword',
            '@keywords': 'keyword',
            '@default': 'identifier',
          },
        },
      ],

      // Whitespace
      { include: '@whitespace' },

      // Delimiters and operators
      [/[{}()\[\]]/, '@brackets'],
      [/[;,.]/, 'delimiter'],
      [
        /@symbols/,
        {
          cases: {
            '@operators': 'operator',
            '@default': '',
          },
        },
      ],

      // Numbers
      [/\d+\.\d+([eE][\-+]?\d+)?/, 'number.float'],
      [/\d+/, 'number'],

      // Strings
      [/"([^"\\]|\\.)*$/, 'string.invalid'], // non-terminated string
      [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],
      [/`/, { token: 'string.quote', bracket: '@open', next: '@rawstring' }],
    ],

    whitespace: [
      [/[ \t\r\n]+/, 'white'],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*$/, 'comment'],
    ],

    comment: [
      [/[^\/*]+/, 'comment'],
      [/\/\*/, 'comment', '@push'],
      ["\\*/", 'comment', '@pop'],
      [/[/*]/, 'comment'],
    ],

    string: [
      [/[^\\"]+/, 'string'],
      [/@escapes/, 'string.escape'],
      [/\\./, 'string.escape.invalid'],
      [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
    ],

    rawstring: [
      [/[^\\`]+/, 'string'],
      [/\\`/, 'string.escape'],
      [/`/, { token: 'string.quote', bracket: '@close', next: '@pop' }],
    ],
  },
};
