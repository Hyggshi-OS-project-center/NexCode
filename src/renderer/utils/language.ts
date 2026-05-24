/**
 * Maps file extensions to Monaco language IDs.
 * Monaco bundles grammars for these languages — we only need correct extension → id mapping.
 */
const EXT_TO_LANG: Record<string, string> = {
  // Web
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  jsonc: 'json',
  webmanifest: 'json',
  html: 'html',
  htm: 'html',
  xhtml: 'html',
  vue: 'html',
  svelte: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'scss',
  less: 'less',
  styl: 'css',
  stylus: 'css',

  // Markup & docs
  md: 'markdown',
  markdown: 'markdown',
  mdx: 'markdown',
  rst: 'restructuredtext',
  tex: 'plaintext',
  adoc: 'plaintext',

  // Systems & shells
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  fish: 'shell',
  ps1: 'powershell',
  psm1: 'powershell',
  psd1: 'powershell',
  bat: 'bat',
  cmd: 'bat',

  // Python & Ruby
  py: 'python',
  pyw: 'python',
  pyi: 'python',
  rb: 'ruby',
  erb: 'ruby',
  gemspec: 'ruby',
  rake: 'ruby',

  // Lua
  lua: 'lua',

  // C family
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  hh: 'cpp',
  hxx: 'cpp',
  cs: 'csharp',
  csx: 'csharp',

  // JVM & mobile
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  scala: 'scala',
  sc: 'scala',
  gradle: 'java',

  // Apple
  swift: 'swift',
  m: 'objective-c',
  mm: 'objective-c',

  // Go, Rust, Zig-style
  go: 'go',
  rs: 'rust',

  // .NET & functional
  fs: 'fsharp',
  fsx: 'fsharp',
  fsproj: 'fsharp',
  vb: 'vb',
  clj: 'clojure',
  cljs: 'clojure',
  cljc: 'clojure',
  ex: 'elixir',
  exs: 'elixir',
  erl: 'plaintext',
  hs: 'plaintext',

  // Data & config
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'ini',
  ini: 'ini',
  cfg: 'ini',
  conf: 'ini',
  properties: 'ini',
  env: 'ini',
  xml: 'xml',
  xsd: 'xml',
  xsl: 'xml',
  xslt: 'xml',
  svg: 'xml',
  plist: 'xml',
  sql: 'sql',
  mysql: 'mysql',
  pgsql: 'pgsql',
  psql: 'pgsql',
  hql: 'sql',

  // DevOps & infra
  dockerfile: 'dockerfile',
  containerfile: 'dockerfile',
  tf: 'hcl',
  hcl: 'hcl',
  nomad: 'hcl',
  graphql: 'graphql',
  gql: 'graphql',
  proto: 'protobuf',
  prisma: 'graphql',

  // PHP & web backends
  php: 'php',
  phtml: 'php',
  blade: 'php',

  // Perl, R, Julia
  pl: 'perl',
  pm: 'perl',
  r: 'r',
  jl: 'julia',

  // Templates
  hbs: 'handlebars',
  handlebars: 'handlebars',
  mustache: 'handlebars',
  jinja: 'html',
  jinja2: 'html',
  j2: 'html',
  liquid: 'html',
  twig: 'twig',
  pug: 'pug',
  jade: 'pug',
  ejs: 'html',
  njk: 'html',
  nunjucks: 'html',

  // Other
  dart: 'dart',
  coffee: 'coffee',
  litcoffee: 'coffee',
  sol: 'solidity',
  pas: 'pascal',
  pp: 'pascal',
  rkt: 'scheme',
  scm: 'scheme',
  ss: 'scheme',
  lisp: 'scheme',
  lsp: 'scheme',
  diff: 'plaintext',
  patch: 'plaintext',
  log: 'plaintext',
  txt: 'plaintext',
  csv: 'plaintext',
  tsv: 'plaintext',
  gitignore: 'plaintext',
  gitattributes: 'plaintext',
  editorconfig: 'ini',
  prettierrc: 'json',
  eslintrc: 'json',
  vsix: 'json',
  lock: 'json',
};

/** Filenames without extension (or special dotfiles) */
const NAME_TO_LANG: Record<string, string> = {
  dockerfile: 'dockerfile',
  containerfile: 'dockerfile',
  makefile: 'shell',
  gnumakefile: 'shell',
  cmakelists: 'plaintext',
  '.gitignore': 'plaintext',
  '.gitattributes': 'plaintext',
  '.editorconfig': 'ini',
  '.env': 'ini',
  '.env.local': 'ini',
  '.env.development': 'ini',
  '.env.production': 'ini',
  'package.json': 'json',
  'package-lock.json': 'json',
  'tsconfig.json': 'json',
  'jsconfig.json': 'json',
};

const DISPLAY_NAMES: Record<string, string> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  json: 'JSON',
  markdown: 'Markdown',
  python: 'Python',
  lua: 'Lua',
  plaintext: 'Plain Text',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  less: 'Less',
  shell: 'Shell',
  powershell: 'PowerShell',
  bat: 'Batch',
  ruby: 'Ruby',
  c: 'C',
  cpp: 'C++',
  csharp: 'C#',
  java: 'Java',
  kotlin: 'Kotlin',
  scala: 'Scala',
  swift: 'Swift',
  'objective-c': 'Objective-C',
  go: 'Go',
  rust: 'Rust',
  fsharp: 'F#',
  vb: 'Visual Basic',
  clojure: 'Clojure',
  elixir: 'Elixir',
  yaml: 'YAML',
  ini: 'INI',
  xml: 'XML',
  sql: 'SQL',
  mysql: 'MySQL',
  pgsql: 'PostgreSQL',
  dockerfile: 'Dockerfile',
  hcl: 'HCL',
  graphql: 'GraphQL',
  protobuf: 'Protobuf',
  php: 'PHP',
  perl: 'Perl',
  r: 'R',
  julia: 'Julia',
  handlebars: 'Handlebars',
  twig: 'Twig',
  pug: 'Pug',
  dart: 'Dart',
  coffee: 'CoffeeScript',
  solidity: 'Solidity',
  pascal: 'Pascal',
  scheme: 'Scheme',
  restructuredtext: 'reStructuredText',
  razor: 'Razor',
  redis: 'Redis',
  sparql: 'SPARQL',
  apex: 'Apex',
  abap: 'ABAP',
  bicep: 'Bicep',
  makefile: 'Makefile',
  hosc: 'HOSC',
};

export function getLanguageFromPath(filePath: string): string {
  const base = filePath.split(/[/\\]/).pop() ?? filePath;
  const lowerName = base.toLowerCase();

  if (NAME_TO_LANG[lowerName]) return NAME_TO_LANG[lowerName];

  const dotless = lowerName.startsWith('.') ? lowerName.slice(1) : lowerName;
  if (NAME_TO_LANG[dotless]) return NAME_TO_LANG[dotless];

  const ext = lowerName.includes('.') ? lowerName.split('.').pop() ?? '' : '';
  if (ext && EXT_TO_LANG[ext]) return EXT_TO_LANG[ext];

  // Compound extensions: foo.test.ts → typescript
  const parts = lowerName.split('.');
  if (parts.length > 2) {
    const compound = parts.slice(-2).join('.');
    const compoundExt = parts[parts.length - 1];
    if (compoundExt && EXT_TO_LANG[compoundExt]) return EXT_TO_LANG[compoundExt];
    void compound;
  }

  return 'plaintext';
}

export function getDisplayLanguage(langId: string): string {
  return DISPLAY_NAMES[langId] ?? langId.charAt(0).toUpperCase() + langId.slice(1);
}

/** All Monaco language IDs we map extensions to (for settings/docs). */
export function getSupportedExtensionCount(): number {
  return Object.keys(EXT_TO_LANG).length;
}
