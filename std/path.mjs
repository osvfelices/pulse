import nodePath from 'node:path';
const print = console.log;
function join(path1, path2, path3, path4, path5) {
  if (path5) {
  return nodePath.join(path1, path2, path3, path4, path5);
} else if (path4) {
  return nodePath.join(path1, path2, path3, path4);
} else if (path3) {
  return nodePath.join(path1, path2, path3);
} else if (path2) {
  return nodePath.join(path1, path2);
} else {
  return nodePath.join(path1);
}
}
function basename(p, ext) {
  if (ext) {
  return nodePath.basename(p, ext);
}
  return nodePath.basename(p);
}
function dirname(p) {
  return nodePath.dirname(p);
}
function extname(p) {
  return nodePath.extname(p);
}
function normalize(p) {
  return nodePath.normalize(p);
}
function isAbsolute(p) {
  return nodePath.isAbsolute(p);
}
function resolve(path1, path2, path3, path4, path5) {
  if (path5) {
  return nodePath.resolve(path1, path2, path3, path4, path5);
} else if (path4) {
  return nodePath.resolve(path1, path2, path3, path4);
} else if (path3) {
  return nodePath.resolve(path1, path2, path3);
} else if (path2) {
  return nodePath.resolve(path1, path2);
} else {
  return nodePath.resolve(path1);
}
}
function relative(fromPath, toPath) {
  return nodePath.relative(fromPath, toPath);
}
function parse(p) {
  return nodePath.parse(p);
}
function format(pathObject) {
  return nodePath.format(pathObject);
}
function separator() {
  return nodePath.sep;
}
function delimiter() {
  return nodePath.delimiter;
}
export default {join: join, basename: basename, dirname: dirname, extname: extname, normalize: normalize, isAbsolute: isAbsolute, resolve: resolve, relative: relative, parse: parse, format: format, separator: separator, delimiter: delimiter};
